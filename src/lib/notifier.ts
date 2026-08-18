import type { PrismaClient } from '@prisma/client';
import { getNotificationConfig, NOTIFICATION_CHANNELS, type NotificationChannel } from './notify-config';
import { shouldSendNotification, DEFAULT_COOLDOWN_KEY, type CooldownChannel } from './cooldown';
import { sendTelegramToChats, formatTelegramMessage } from './channels/telegram';
import { sendEmail, formatEmailHtml, formatEmailSubject } from './channels/email';
import { sendWebhooks } from './channels/webhook';
import { sendSms } from './channels/sms';

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
}

export interface DispatchResult {
  sent: CooldownChannel[];
  skipped: CooldownChannel[];
  failed: CooldownChannel[];
}

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

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
    default:
      return false;
  }
}

/**
 * Dispatch an alert notification to every enabled recipient channel.
 * Per-channel cooldown is persisted in the DB (survives worker restarts).
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
      continue;
    }

    const ok = await sendToChannel(cfg, channel, payload);
    if (ok) result.sent.push(channel);
    else result.failed.push(channel);
  }

  return result;
}

async function sendToChannel(
  cfg: Awaited<ReturnType<typeof getNotificationConfig>>,
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
      default:
        return false;
    }
  } catch (err) {
    console.error(`[Notify] Unexpected error dispatching ${channel}:`, err);
    return false;
  }
}

/**
 * Convenience wrapper matching the old worker API: builds the payload and
 * dispatches. Returns the dispatch result.
 */
export async function sendNotificationWithCooldown(
  prisma: PrismaClient,
  args: Omit<NotificationPayload, 'timestamp'> & { deviceIp?: string }
): Promise<DispatchResult> {
  return dispatchNotifications(prisma, args);
}