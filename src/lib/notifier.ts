import type { PrismaClient } from '@prisma/client';
import { getNotificationConfig, NOTIFICATION_CHANNELS, severityAtLeast, type NotificationChannel } from './notify-config';
import { shouldSendNotification, DEFAULT_COOLDOWN_KEY, type CooldownChannel } from './cooldown';
import { sendTelegramToChats, formatTelegramMessage } from './channels/telegram';
import { sendEmail, formatEmailSubject, formatEmailHtml } from './channels/email';
import { sendWebhooks } from './channels/webhook';
import { sendSms } from './channels/sms';
import { sendToSiem } from './channels/siem';

export interface NotificationPayload {
  type: string;
  severity: string;
  deviceId: string;
  deviceName: string;
  deviceIp?: string;
  message: string;
  /** Distinguishes alert "families" for one device (cpu/mem/recover...). */
  cooldownKey?: string;
  /** Cooldown window for this payload (e.g. worker policy). */
  cooldownMs: number;
  /** Optional override for consistent timestamps across channels. */
  timestamp?: Date;
  /** ID alert terkait — bila ada, hasil kirim di-persist ke AlertDelivery. */
  alertId?: string;
  /** Nilai metrik pemicu untuk konteks delivery. */
  valueSnapshot?: Record<string, unknown>;
}

export interface DispatchResult {
  sent: CooldownChannel[];
  skipped: CooldownChannel[];
  failed: CooldownChannel[];
}

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

// Retry policy: max attempts + backoff (ms) untuk channel yang gagal.
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [0, 1_000, 5_000] as const;

const severityEmoji: Record<string, string> = {
  LOW: '🟢',
  MEDIUM: '🟡',
  HIGH: '🟠',
  CRITICAL: '🔴',
};

function timestampLabel(ts: Date): string {
  return ts.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

function plainText(
  payload: NotificationPayload,
  includeIp: boolean
): string {
  const emoji = severityEmoji[payload.severity] || '⚪';
  const ip = payload.deviceIp && includeIp ? ` (${payload.deviceIp})` : '';
  const time = timestampLabel(payload.timestamp ?? new Date());
  return `${emoji} [${payload.severity}] ${payload.type}
Device: ${payload.deviceName}${ip}
Message: ${payload.message}
Time: ${time}`;
}

function channelEnabled(cfg: Awaited<ReturnType<typeof getNotificationConfig>>, channel: NotificationChannel): boolean {
  switch (channel) {
    case 'telegram':
      return Boolean(cfg.telegram.enabled && cfg.telegram.botToken && cfg.telegram.chatIds.length > 0);
    case 'email':
      return Boolean(
        cfg.email.enabled &&
          cfg.email.host &&
          cfg.email.from &&
          cfg.email.recipients.length > 0
      );
    case 'webhook':
      return Boolean(cfg.webhook.enabled && cfg.webhook.urls.length > 0);
    case 'sms':
      return Boolean(
        cfg.sms.enabled &&
          cfg.sms.toNumbers.length > 0 &&
          (cfg.sms.provider === 'generic' ? Boolean(cfg.sms.apiUrl) : Boolean(cfg.sms.accountSid && cfg.sms.apiKey))
      );
    case 'siem':
      return Boolean(cfg.siem.enabled && cfg.siem.urls.length > 0);
    default:
      return false;
  }
}

/**
 * Dispatch an alert notification to every enabled recipient channel.
 * Per-channel cooldown is persisted in the DB (survives worker restarts).
 * Hasil tiap channel direkam ke tabel AlertDelivery bila payload.alertId ada.
 */
export async function dispatchNotifications(
  prisma: PrismaClient,
  payload: NotificationPayload
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: [], skipped: [], failed: [] };
  const cooldownKey = payload.cooldownKey || DEFAULT_COOLDOWN_KEY;
  const cooldownMs = payload.cooldownMs > 0 ? payload.cooldownMs : DEFAULT_COOLDOWN_MS;
  const timestamp = payload.timestamp ?? new Date();

  const cfg = await getNotificationConfig(prisma);

  for (const channel of NOTIFICATION_CHANNELS) {
    if (!channelEnabled(cfg, channel)) {
      result.skipped.push(channel);
      await recordDeliveryFor(prisma, payload, channel, 'SKIPPED', 0, 'channel disabled', timestamp);
      continue;
    }

    // Routing severity: channel hanya menerima alert dengan severity >= minSeverity.
    if (!severityAtLeast(channelGate(cfg, channel), payload.severity)) {
      result.skipped.push(channel);
      await recordDeliveryFor(prisma, payload, channel, 'SKIPPED', 0, 'below min severity', timestamp);
      continue;
    }

    const allowed = await shouldSendNotification(
      prisma,
      {
        deviceId: payload.deviceId,
        channel,
        cooldownKey,
        cooldownMs,
      },
      timestamp.getTime()
    );

    if (!allowed) {
      result.skipped.push(channel);
      await recordDeliveryFor(prisma, payload, channel, 'SKIPPED', 0, 'cooldown', timestamp);
      continue;
    }

    const { ok, attempts } = await sendWithRetry(cfg, channel, payload);
    if (ok) {
      result.sent.push(channel);
      await recordDeliveryFor(prisma, payload, channel, 'SENT', attempts, undefined, timestamp);
    } else {
      result.failed.push(channel);
      await recordDeliveryFor(prisma, payload, channel, 'FAILED', attempts, 'channel reported failure', timestamp);
    }
  }

  return result;
}

// ─── Send + retry (backoff) ───────────────────────────────────────────────────
type NotifConfig = Awaited<ReturnType<typeof getNotificationConfig>>;

function channelGate(cfg: NotifConfig, channel: NotificationChannel) {
  switch (channel) {
    case 'telegram': return cfg.telegram.minSeverity;
    case 'email':    return cfg.email.minSeverity;
    case 'webhook':  return cfg.webhook.minSeverity;
    case 'sms':      return cfg.sms.minSeverity;
    case 'siem':     return cfg.siem.minSeverity;
    default:         return undefined;
  }
}

async function sendWithRetry(
  cfg: NotifConfig,
  channel: NotificationChannel,
  payload: NotificationPayload
): Promise<{ ok: boolean; attempts: number }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const delay = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (await sendToChannel(cfg, channel, payload)) {
      return { ok: true, attempts: attempt + 1 };
    }
  }
  return { ok: false, attempts: MAX_RETRIES };
}

// ─── Persist satu baris delivery (best-effort) ────────────────────────────────
async function recordDeliveryFor(
  prisma: PrismaClient,
  payload: NotificationPayload,
  channel: NotificationChannel,
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED',
  attempts: number,
  error?: string,
  timestamp?: Date
): Promise<void> {
  if (!payload.alertId) return;
  try {
    await prisma.alertDelivery.create({
      data: {
        alertId: payload.alertId,
        channel,
        status,
        attempts,
        error: error ?? null,
        sentAt: status === 'SENT' ? (timestamp ?? new Date()) : null,
      },
    });
  } catch (err) {
    console.error('[Notify] Failed to record delivery', err);
  }
}

/**
 * Kirim notifikasi uji ke satu channel menggunakan konfigurasi tersimpan.
 * Dipakai oleh tombol "Test Kirim" di halaman settings. Tanpa cooldown.
 */
export async function sendTestNotification(
  prisma: PrismaClient,
  channel: NotificationChannel
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = await getNotificationConfig(prisma);
    if (!channelEnabled(cfg, channel)) {
      return { ok: false, error: 'Channel belum dikonfigurasi / dinonaktifkan' };
    }
    const payload: NotificationPayload = {
      type: 'TEST_NOTIFICATION',
      severity: 'LOW',
      deviceId: 'system',
      deviceName: 'HK-NOVA',
      message: `Notifikasi uji dari HK-NOVA — channel ${channel} terkonfigurasi dengan baik.`,
      cooldownMs: 0,
    };
    const ok = await sendToChannel(cfg, channel, payload);
    return ok ? { ok: true } : { ok: false, error: 'Gagal mengirim test; cek log server' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendToChannel(
  cfg: NotifConfig,
  channel: NotificationChannel,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    switch (channel) {
      case 'telegram':
        return sendTelegramToChats(
          cfg.telegram.botToken,
          cfg.telegram.chatIds,
          formatTelegramMessage(payload.type, payload.severity, payload.deviceName, payload.message)
        );
      case 'email':
        return sendEmail(
          cfg.email,
          formatEmailSubject(payload.type, payload.severity, payload.deviceName),
          formatEmailHtml(
            payload.type,
            payload.severity,
            payload.deviceName,
            payload.deviceIp ?? '',
            payload.message
          )
        );
      case 'webhook':
        return sendWebhooks(cfg.webhook.urls, plainText(payload, true));
      case 'sms':
        return sendSms(cfg.sms, plainText(payload, false));
      case 'siem':
        return sendToSiem(cfg.siem, {
          event: 'alert',
          source: 'hk-nova',
          '@timestamp': (payload.timestamp ?? new Date()).toISOString(),
          device: {
            id: payload.deviceId,
            name: payload.deviceName,
            ip: payload.deviceIp ?? '',
          },
          metricType: 'ICMP' as const,
          metrics: {
            alertType: payload.type,
            severity: payload.severity,
            message: payload.message,
          },
          maintenance: false,
        });
      default:
        return false;
    }
  } catch (err) {
    console.error(`[Notify] Unexpected error dispatching ${channel}:`, err);
    return false;
  }
}