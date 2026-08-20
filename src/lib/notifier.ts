import type { PrismaClient } from '@prisma/client';
import {
  getNotificationConfig,
  NOTIFICATION_CHANNELS,
  severityAtLeast,
  type NotificationChannel,
} from './notify-config';
import { shouldSendNotification, DEFAULT_COOLDOWN_KEY, type CooldownChannel } from './cooldown';
import { channelInQuietHours } from './quiet-hours';
import { bufferForDigest } from './digest';
import { getAlertPolicy } from './alert-policy';
import { sendTelegramToChats, formatTelegramMessage } from './channels/telegram';
import { sendEmail, formatEmailSubject, formatEmailHtml } from './channels/email';
import { sendSms } from './channels/sms';
import { sendToSiem } from './channels/siem';
import { sendWebhooks, type WebhookPayload } from './channels/webhook';

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
// Jadwal kirim-ulang oleh worker delivery-retry untuk FAILED yang menetap.
export const RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 5;

const severityEmoji: Record<string, string> = {
  LOW: '🟢',
  MEDIUM: '🟡',
  HIGH: '🟠',
  CRITICAL: '🔴',
};

function timestampLabel(ts: Date): string {
  return ts.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

function plainText(payload: NotificationPayload, includeIp: boolean): string {
  const emoji = severityEmoji[payload.severity] || '⚪';
  const ip = payload.deviceIp && includeIp ? ` (${payload.deviceIp})` : '';
  const time = timestampLabel(payload.timestamp ?? new Date());
  return `${emoji} [${payload.severity}] ${payload.type}
Device: ${payload.deviceName}${ip}
Message: ${payload.message}
Time: ${time}`;
}

function channelEnabled(
  cfg: Awaited<ReturnType<typeof getNotificationConfig>>,
  channel: NotificationChannel
): boolean {
  switch (channel) {
    case 'telegram':
      return Boolean(
        cfg.telegram.enabled && cfg.telegram.botToken && cfg.telegram.chatIds.length > 0
      );
    case 'email':
      return Boolean(
        cfg.email.enabled && cfg.email.host && cfg.email.from && cfg.email.recipients.length > 0
      );
    case 'webhook':
      return Boolean(cfg.webhook.enabled && cfg.webhook.urls.length > 0);
    case 'sms':
      return Boolean(
        cfg.sms.enabled &&
        cfg.sms.toNumbers.length > 0 &&
        (cfg.sms.provider === 'generic'
          ? Boolean(cfg.sms.apiUrl)
          : Boolean(cfg.sms.accountSid && cfg.sms.apiKey))
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
  payload: NotificationPayload,
  opts: { skipDigest?: boolean } = {}
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: [], skipped: [], failed: [] };
  const cooldownKey = payload.cooldownKey || DEFAULT_COOLDOWN_KEY;
  const cooldownMs = payload.cooldownMs > 0 ? payload.cooldownMs : DEFAULT_COOLDOWN_MS;
  const timestamp = payload.timestamp ?? new Date();

  // Mode digest: alert ditampung dulu, dikirim ringkas oleh digest-worker.
  if (!opts.skipDigest) {
    let digestEnabled = false;
    try {
      digestEnabled = (await getAlertPolicy(prisma)).digestEnabled;
    } catch {
      digestEnabled = false;
    }
    if (digestEnabled) {
      await bufferForDigest(prisma, {
        type: payload.type,
        severity: payload.severity,
        deviceId: payload.deviceId,
        deviceName: payload.deviceName,
        deviceIp: payload.deviceIp,
        message: payload.message,
        timestamp: timestamp.toISOString(),
      });
      return result;
    }
  }

  const cfg = await getNotificationConfig(prisma);

  for (const channel of NOTIFICATION_CHANNELS) {
    if (!channelEnabled(cfg, channel)) {
      result.skipped.push(channel);
      await recordDeliveryFor(
        prisma,
        payload,
        channel,
        'SKIPPED',
        0,
        'channel disabled',
        timestamp
      );
      continue;
    }

    // Routing severity: channel hanya menerima alert dengan severity >= minSeverity.
    if (!severityAtLeast(channelGate(cfg, channel), payload.severity)) {
      result.skipped.push(channel);
      await recordDeliveryFor(
        prisma,
        payload,
        channel,
        'SKIPPED',
        0,
        'below min severity',
        timestamp
      );
      continue;
    }

    // Silent hours: channel diredam pada jendela quiet (kecuali bypassFor).
    if (channelInQuietHours(channelQuiet(cfg, channel), payload.severity, timestamp)) {
      result.skipped.push(channel);
      await recordDeliveryFor(prisma, payload, channel, 'SKIPPED', 0, 'quiet hours', timestamp);
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
      await recordDeliveryFor(
        prisma,
        payload,
        channel,
        'FAILED',
        Math.min(attempts, MAX_RETRY_ATTEMPTS),
        'channel reported failure',
        timestamp,
        new Date(timestamp.getTime() + RETRY_DELAY_MS)
      );
    }
  }

  return result;
}

// ─── Send + retry (backoff) ───────────────────────────────────────────────────
type NotifConfig = Awaited<ReturnType<typeof getNotificationConfig>>;

function channelGate(cfg: NotifConfig, channel: NotificationChannel) {
  switch (channel) {
    case 'telegram':
      return cfg.telegram.minSeverity;
    case 'email':
      return cfg.email.minSeverity;
    case 'webhook':
      return cfg.webhook.minSeverity;
    case 'sms':
      return cfg.sms.minSeverity;
    case 'siem':
      return cfg.siem.minSeverity;
    default:
      return undefined;
  }
}

function channelQuiet(cfg: NotifConfig, channel: NotificationChannel) {
  switch (channel) {
    case 'telegram':
      return cfg.telegram.quietHours;
    case 'email':
      return cfg.email.quietHours;
    case 'webhook':
      return cfg.webhook.quietHours;
    case 'sms':
      return cfg.sms.quietHours;
    case 'siem':
      return cfg.siem.quietHours;
    default:
      return undefined;
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
  timestamp?: Date,
  nextRetryAt?: Date
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
        nextRetryAt: nextRetryAt ?? null,
      },
    });
  } catch (err) {
    console.error('[Notify] Failed to record delivery', err);
  }
}

/**
 * Kirim ulang SATU delivery yang gagal (dipakai worker delivery-retry).
 * Mengembalikan status hasil setelah meng-update baris AlertDelivery.
 */
export async function resendDelivery(
  prisma: PrismaClient,
  deliveryId: string
): Promise<{ ok: boolean; channel: string; attempts: number; error?: string }> {
  const delivery = await prisma.alertDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      alert: { include: { device: { select: { id: true, name: true, ip: true } } } },
    },
  });
  if (!delivery) return { ok: false, channel: 'unknown', attempts: 0, error: 'delivery not found' };
  const attempts = delivery.attempts + 1;
  if (attempts > MAX_RETRY_ATTEMPTS) {
    return { ok: false, channel: delivery.channel, attempts, error: 'max retry exceeded' };
  }

  const channel = delivery.channel as NotificationChannel;
  if (!NOTIFICATION_CHANNELS.includes(channel)) {
    return { ok: false, channel, attempts, error: `invalid channel ${channel}` };
  }

  const alert = delivery.alert;
  const device = alert.device;
  const payload: NotificationPayload = {
    type: alert.type,
    severity: alert.severity,
    deviceId: device?.id ?? 'system',
    deviceName: device?.name ?? 'System',
    deviceIp: device?.ip,
    message: alert.message,
    cooldownKey: 'retry',
    cooldownMs: 0,
    alertId: alert.id,
    timestamp: new Date(),
  };

  try {
    const cfg = await getNotificationConfig(prisma);
    const ok = await sendToChannel(cfg, channel, payload);
    await prisma.alertDelivery.update({
      where: { id: deliveryId },
      data: ok
        ? { status: 'SENT', attempts, sentAt: new Date(), nextRetryAt: null, error: null }
        : {
            status: 'FAILED',
            attempts,
            nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS),
            error: 'retry still failing',
          },
    });
    return { ok, channel, attempts };
  } catch (err) {
    await prisma.alertDelivery
      .update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          attempts,
          nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS),
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
    return {
      ok: false,
      channel,
      attempts,
      error: err instanceof Error ? err.message : String(err),
    };
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
      case 'webhook': {
        const whPayload: WebhookPayload = {
          type: payload.type,
          severity: payload.severity,
          deviceName: payload.deviceName,
          deviceIp: payload.deviceIp,
          message: payload.message,
          timestamp: timestampLabel(payload.timestamp ?? new Date()),
          valueSnapshot: payload.valueSnapshot ?? null,
          alertId: payload.alertId,
        };
        return sendWebhooks(cfg.webhook.urls, whPayload, {
          secret: cfg.webhook.signatureSecret,
          headers: cfg.webhook.headers,
          format: cfg.webhook.format,
        });
      }
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
