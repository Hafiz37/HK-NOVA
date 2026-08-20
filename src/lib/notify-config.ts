import type { PrismaClient } from '@prisma/client';
import { encrypt, safeDecrypt } from './encryption';

export const NOTIFICATION_SETTING_KEY = 'notify:channels';

/** Sentinels used when a secret is carried back from the API without being changed. */
export const MASK_VALUE = '***MASKED***';

export type NotificationChannel = 'telegram' | 'email' | 'webhook' | 'sms' | 'siem';

export interface TelegramChannelConfig {
  enabled: boolean;
  botToken: string;
  chatIds: string[];
}

export interface EmailChannelConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  recipients: string[];
}

export interface WebhookChannelConfig {
  enabled: boolean;
  urls: string[];
}

/** Format payload yang dikirim ke endpoint SIEM. */
export type SiemFormat = 'generic' | 'splunk';

export interface SiemChannelConfig {
  enabled: boolean;
  urls: string[];
  /** Token otentikasi (Splunk HEC token / Elasticsearch API key). Opsional. */
  token: string;
  format: SiemFormat;
}

export type SmsProvider = 'generic' | 'twilio';

export interface SmsChannelConfig {
  enabled: boolean;
  provider: SmsProvider;
  apiUrl: string;
  apiKey: string;
  accountSid: string;
  senderId: string;
  toNumbers: string[];
}

export interface NotificationConfig {
  telegram: TelegramChannelConfig;
  email: EmailChannelConfig;
  webhook: WebhookChannelConfig;
  sms: SmsChannelConfig;
  siem: SiemChannelConfig;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  telegram: { enabled: false, botToken: '', chatIds: [] },
  email: {
    enabled: false,
    host: '',
    port: 465,
    secure: true,
    username: '',
    password: '',
    from: '',
    recipients: [],
  },
  webhook: { enabled: false, urls: [] },
  sms: { enabled: false, provider: 'generic', apiUrl: '', apiKey: '', accountSid: '', senderId: '', toNumbers: [] },
  siem: { enabled: false, urls: [], token: '', format: 'generic' },
};

function splitList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeChannel<T extends object>(def: T, stored: T | undefined): T {
  if (!stored || typeof stored !== 'object') return { ...def };
  return { ...def, ...stored };
}

/** Apply environment-variable fallbacks for any unset/empty fields. */
function applyEnvFallbacks(cfg: NotificationConfig): void {
  if (!cfg.telegram.botToken) cfg.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (cfg.telegram.chatIds.length === 0) {
    cfg.telegram.chatIds = splitList(process.env.TELEGRAM_CHAT_ID);
  }

  const email = cfg.email;
  if (!email.host) email.host = process.env.SMTP_HOST || '';
  if (!email.port) email.port = Number(process.env.SMTP_PORT ?? (email.secure ? 465 : 587));
  email.secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : email.secure;
  if (!email.username) email.username = process.env.SMTP_USER || '';
  if (!email.password) email.password = process.env.SMTP_PASS || '';
  if (!email.from) email.from = process.env.SMTP_FROM || '';
  if (email.recipients.length === 0) {
    email.recipients = splitList(process.env.SMTP_RECIPIENTS);
  }

  if (cfg.webhook.urls.length === 0) {
    cfg.webhook.urls = splitList(process.env.NOTIFY_WEBHOOK_URLS);
  }

  if (cfg.siem.urls.length === 0) {
    cfg.siem.urls = splitList(process.env.SIEM_WEBHOOK_URLS);
  }
  if (!cfg.siem.token) {
    cfg.siem.token = process.env.SIEM_WEBHOOK_TOKEN || '';
  }
  if (process.env.SIEM_FORMAT === 'splunk') {
    cfg.siem.format = 'splunk';
  }

  const sms = cfg.sms;
  if (!sms.apiUrl) sms.apiUrl = process.env.SMS_API_URL || '';
  if (!sms.apiKey) sms.apiKey = process.env.SMS_API_KEY || '';
  if (!sms.accountSid) sms.accountSid = process.env.SMS_ACCOUNT_SID || '';
  if (!sms.senderId) sms.senderId = process.env.SMS_SENDER_ID || '';
  if (sms.toNumbers.length === 0) {
    sms.toNumbers = splitList(process.env.SMS_TO_NUMBERS);
  }
}

/**
 * Build the effective config: stored DB value (merged over defaults) with
 * secrets decrypted, then env fallbacks for any remaining empty field.
 */
export async function getNotificationConfig(prisma: PrismaClient): Promise<NotificationConfig> {
  let stored: Partial<NotificationConfig> | null = null;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: NOTIFICATION_SETTING_KEY } });
    if (setting?.value && typeof setting.value === 'object') {
      stored = setting.value as Partial<NotificationConfig>;
    }
  } catch (err) {
    console.warn('[Notify Config] Failed to read channel config from DB', err);
  }

  const cfg: NotificationConfig = {
    telegram: mergeChannel(DEFAULT_NOTIFICATION_CONFIG.telegram, stored?.telegram),
    email: mergeChannel(DEFAULT_NOTIFICATION_CONFIG.email, stored?.email),
    webhook: mergeChannel(DEFAULT_NOTIFICATION_CONFIG.webhook, stored?.webhook),
    sms: mergeChannel(DEFAULT_NOTIFICATION_CONFIG.sms, stored?.sms),
    siem: mergeChannel(DEFAULT_NOTIFICATION_CONFIG.siem, stored?.siem),
  };

  cfg.telegram.botToken = safeDecrypt(cfg.telegram.botToken) ?? '';
  cfg.email.password = safeDecrypt(cfg.email.password) ?? '';
  cfg.sms.apiKey = safeDecrypt(cfg.sms.apiKey) ?? '';
  cfg.siem.token = safeDecrypt(cfg.siem.token) ?? '';

  applyEnvFallbacks(cfg);
  return cfg;
}

/**
 * Persist a config. Secret fields that equal MASK_VALUE keep their previous
 * stored value; non-empty, non-masked secrets are encrypted before storage.
 */
export async function saveNotificationConfig(prisma: PrismaClient, config: NotificationConfig): Promise<void> {
  const previous = await readDecryptedConfig(prisma);

  const next = {
    telegram: {
      enabled: Boolean(config.telegram.enabled),
      botToken: resolveSecret(config.telegram.botToken, previous.telegram.botToken),
      chatIds: normalizeList(config.telegram.chatIds),
    },
    email: {
      enabled: Boolean(config.email.enabled),
      host: config.email.host.trim(),
      port: Number(config.email.port) || DEFAULT_NOTIFICATION_CONFIG.email.port,
      secure: Boolean(config.email.secure),
      username: config.email.username.trim(),
      password: resolveSecret(config.email.password, previous.email.password),
      from: config.email.from.trim(),
      recipients: normalizeList(config.email.recipients),
    },
    webhook: {
      enabled: Boolean(config.webhook.enabled),
      urls: normalizeList(config.webhook.urls),
    },
    sms: {
      enabled: Boolean(config.sms.enabled),
      provider: config.sms.provider === 'twilio' ? 'twilio' : 'generic',
      apiUrl: config.sms.apiUrl.trim(),
      apiKey: resolveSecret(config.sms.apiKey, previous.sms.apiKey),
      accountSid: config.sms.accountSid.trim(),
      senderId: config.sms.senderId.trim(),
      toNumbers: normalizeList(config.sms.toNumbers),
    },
    siem: {
      enabled: Boolean(config.siem.enabled),
      urls: normalizeList(config.siem.urls),
      token: resolveSecret(config.siem.token, previous.siem.token),
      format: config.siem.format === 'splunk' ? 'splunk' : 'generic',
    },
  };

  await prisma.setting.upsert({
    where: { key: NOTIFICATION_SETTING_KEY },
    update: { value: next as unknown as PrismaJsonValue },
    create: { key: NOTIFICATION_SETTING_KEY, value: next as unknown as PrismaJsonValue },
  });
}

type PrismaJsonValue = Parameters<PrismaClient['setting']['create']>[0]['data']['value'];

/**
 * Serialize for API/UI consumption — secrets are masked, plus a per-channel
 * `configured` flag that tells the client whether it is fully usable.
 */
export function toPublicNotificationConfig(cfg: NotificationConfig) {
  const mask = (v: string) => (v ? MASK_VALUE : '');

  return {
    telegram: {
      enabled: cfg.telegram.enabled,
      botToken: mask(cfg.telegram.botToken),
      chatIds: [...cfg.telegram.chatIds],
      configured: Boolean(cfg.telegram.botToken && cfg.telegram.chatIds.length > 0),
    },
    email: {
      enabled: cfg.email.enabled,
      host: cfg.email.host,
      port: cfg.email.port,
      secure: cfg.email.secure,
      username: cfg.email.username,
      password: mask(cfg.email.password),
      from: cfg.email.from,
      recipients: [...cfg.email.recipients],
      configured: Boolean(cfg.email.host && cfg.email.from && cfg.email.recipients.length > 0),
    },
    webhook: {
      enabled: cfg.webhook.enabled,
      urls: [...cfg.webhook.urls],
      configured: cfg.webhook.urls.length > 0,
    },
    sms: {
      enabled: cfg.sms.enabled,
      provider: cfg.sms.provider,
      apiUrl: cfg.sms.apiUrl,
      apiKey: mask(cfg.sms.apiKey),
      accountSid: cfg.sms.accountSid,
      senderId: cfg.sms.senderId,
      toNumbers: [...cfg.sms.toNumbers],
      configured: Boolean(
        cfg.sms.toNumbers.length > 0 &&
          (cfg.sms.provider === 'generic' ? cfg.sms.apiUrl : cfg.sms.accountSid)
      ),
    },
    siem: {
      enabled: cfg.siem.enabled,
      urls: [...cfg.siem.urls],
      token: mask(cfg.siem.token),
      format: cfg.siem.format,
      configured: cfg.siem.urls.length > 0,
    },
  };
}

async function readDecryptedConfig(prisma: PrismaClient): Promise<NotificationConfig> {
  let stored: Partial<NotificationConfig> | null = null;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: NOTIFICATION_SETTING_KEY } });
    if (setting?.value && typeof setting.value === 'object') {
      stored = setting.value as Partial<NotificationConfig>;
    }
  } catch {
    stored = null;
  }

  const cfg: NotificationConfig = {
    telegram: mergeChannel(DEFAULT_NOTIFICATION_CONFIG.telegram, stored?.telegram),
    email: mergeChannel(DEFAULT_NOTIFICATION_CONFIG.email, stored?.email),
    webhook: mergeChannel(DEFAULT_NOTIFICATION_CONFIG.webhook, stored?.webhook),
    sms: mergeChannel(DEFAULT_NOTIFICATION_CONFIG.sms, stored?.sms),
    siem: mergeChannel(DEFAULT_NOTIFICATION_CONFIG.siem, stored?.siem),
  };
  cfg.telegram.botToken = safeDecrypt(cfg.telegram.botToken) ?? '';
  cfg.email.password = safeDecrypt(cfg.email.password) ?? '';
  cfg.sms.apiKey = safeDecrypt(cfg.sms.apiKey) ?? '';
  cfg.siem.token = safeDecrypt(cfg.siem.token) ?? '';
  return cfg;
}

function resolveSecret(value: string | undefined, previous: string | undefined): string {
  const v = (value ?? '').trim();
  if (v === MASK_VALUE) return previous ? encrypt(previous) : '';
  if (v === '') return '';
  return encrypt(v);
}

function normalizeList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
}

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['telegram', 'email', 'webhook', 'sms', 'siem'];