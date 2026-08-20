import type { PrismaClient } from '@prisma/client';
import { encrypt, safeDecrypt } from './encryption';

export const NOTIFICATION_SETTING_KEY = 'notify:channels';

/** Sentinels used when a secret is carried back from the API without being changed. */
export const MASK_VALUE = '***MASKED***';

export type NotificationChannel = 'telegram' | 'email' | 'webhook' | 'sms' | 'siem';

/** Batas minimum severity agar sebuah channel diaktifkan untuk alert tsb. */
export type SeverityGate = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Urutan severity untuk perbandingan routing (LOW < MEDIUM < HIGH < CRITICAL). */
export const SEVERITY_ORDER: Record<SeverityGate, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

/** Jadwal senyap per channel (Tahap 3). */
export interface QuietHours {
  enabled: boolean;
  start: string; // "HH:MM" 24-jam
  end: string;   // "HH:MM" 24-jam (mendukung lintas tengah malam)
  timezone: string;
  bypassFor: SeverityGate[]; // severity yang tetap dikirim walau jam senyap
}

export function severityAtLeast(gate: SeverityGate | undefined, severity: string): boolean {
  if (!gate) return true;
  const gateRank = SEVERITY_ORDER[gate] ?? 0;
  const sevRank = SEVERITY_ORDER[severity as SeverityGate] ?? 0;
  return sevRank >= gateRank;
}

export interface TelegramChannelConfig {
  enabled: boolean;
  botToken: string;
  chatIds: string[];
  minSeverity?: SeverityGate;
  quietHours?: QuietHours;
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
  minSeverity?: SeverityGate;
  quietHours?: QuietHours;
}

export interface WebhookChannelConfig {
  enabled: boolean;
  urls: string[];
  minSeverity?: SeverityGate;
  quietHours?: QuietHours;
  /** Format payload webhook. */
  format?: 'slack' | 'discord' | 'teams' | 'generic';
  /** HMAC secret untuk header X-HK-Nova-Signature (opsional). */
  signatureSecret?: string;
  /** Header HTTP tambahan per pengiriman (opsional). */
  headers?: Record<string, string> | null;
}

/** Format payload yang dikirim ke endpoint SIEM. */
export type SiemFormat = 'generic' | 'splunk';

export interface SiemChannelConfig {
  enabled: boolean;
  urls: string[];
  /** Token otentikasi (Splunk HEC token / Elasticsearch API key). Opsional. */
  token: string;
  format: SiemFormat;
  minSeverity?: SeverityGate;
  quietHours?: QuietHours;
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
  minSeverity?: SeverityGate;
  quietHours?: QuietHours;
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
  webhook: { enabled: false, urls: [], minSeverity: undefined, format: 'slack', signatureSecret: '', headers: null },
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
 *
 * Hasil di-cache selama CONFIG_CACHE_TTL_MS untuk menghindari pembacaan DB
 * berulang pada setiap dispatch notifikasi. Cache di-invalidate saat config
 * disimpan (setiap proses memegang cache-nya sendiri di memori).
 */
const CONFIG_CACHE_TTL_MS = 30_000;
let configCache: { cfg: NotificationConfig; at: number } | null = null;

export function invalidateNotificationConfigCache(): void {
  configCache = null;
}

export async function getNotificationConfig(prisma: PrismaClient): Promise<NotificationConfig> {
  if (configCache && Date.now() - configCache.at < CONFIG_CACHE_TTL_MS) {
    return configCache.cfg;
  }

  const cfg = await buildNotificationConfig(prisma);

  configCache = { cfg, at: Date.now() };
  return cfg;
}

async function buildNotificationConfig(prisma: PrismaClient): Promise<NotificationConfig> {
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
  cfg.webhook.signatureSecret = safeDecrypt(cfg.webhook.signatureSecret ?? '') ?? '';
  if (!cfg.webhook.format || !['slack', 'discord', 'teams', 'generic'].includes(cfg.webhook.format)) {
    cfg.webhook.format = 'slack';
  }

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
      minSeverity: normalizeSeverityHeader(config.telegram.minSeverity),
      quietHours: normalizeQuietHours(config.telegram.quietHours),
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
      minSeverity: normalizeSeverityHeader(config.email.minSeverity),
      quietHours: normalizeQuietHours(config.email.quietHours),
    },
    webhook: {
      enabled: Boolean(config.webhook.enabled),
      urls: normalizeList(config.webhook.urls),
      minSeverity: normalizeSeverityHeader(config.webhook.minSeverity),
      quietHours: normalizeQuietHours(config.webhook.quietHours),
      format: config.webhook.format && ['slack', 'discord', 'teams', 'generic'].includes(config.webhook.format)
        ? config.webhook.format
        : 'slack',
      signatureSecret: resolveSecret(config.webhook.signatureSecret, previous.webhook.signatureSecret),
      headers: config.webhook.headers && typeof config.webhook.headers === 'object'
        ? config.webhook.headers
        : null,
    },
    sms: {
      enabled: Boolean(config.sms.enabled),
      provider: config.sms.provider === 'twilio' ? 'twilio' : 'generic',
      apiUrl: config.sms.apiUrl.trim(),
      apiKey: resolveSecret(config.sms.apiKey, previous.sms.apiKey),
      accountSid: config.sms.accountSid.trim(),
      senderId: config.sms.senderId.trim(),
      toNumbers: normalizeList(config.sms.toNumbers),
      minSeverity: normalizeSeverityHeader(config.sms.minSeverity),
      quietHours: normalizeQuietHours(config.sms.quietHours),
    },
    siem: {
      enabled: Boolean(config.siem.enabled),
      urls: normalizeList(config.siem.urls),
      token: resolveSecret(config.siem.token, previous.siem.token),
      format: config.siem.format === 'splunk' ? 'splunk' : 'generic',
      minSeverity: normalizeSeverityHeader(config.siem.minSeverity),
      quietHours: normalizeQuietHours(config.siem.quietHours),
    },
  };

  await prisma.setting.upsert({
    where: { key: NOTIFICATION_SETTING_KEY },
    update: { value: next as unknown as PrismaJsonValue },
    create: { key: NOTIFICATION_SETTING_KEY, value: next as unknown as PrismaJsonValue },
  });

  // Cache lama tidak berlaku lagi setelah konfigurasi berubah.
  invalidateNotificationConfigCache();
}

type PrismaJsonValue = Parameters<PrismaClient['setting']['create']>[0]['data']['value'];

/**
 * Serialize for API/UI consumption — secrets are masked, plus a per-channel
 * `configured` flag that tells the client whether it is fully usable.
 */
export function toPublicNotificationConfig(cfg: NotificationConfig) {
  const mask = (v: string) => (v ? MASK_VALUE : '');
  const gate = (v: SeverityGate | undefined): SeverityGate => (v && v in SEVERITY_ORDER ? (v as SeverityGate) : 'LOW');
  const quiet = (q: QuietHours | undefined): QuietHours => q ?? { enabled: false, start: '22:00', end: '06:00', timezone: 'Asia/Jakarta', bypassFor: [] };

  return {
    telegram: {
      enabled: cfg.telegram.enabled,
      botToken: mask(cfg.telegram.botToken),
      chatIds: [...cfg.telegram.chatIds],
      minSeverity: gate(cfg.telegram.minSeverity),
      quietHours: quiet(cfg.telegram.quietHours),
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
      minSeverity: gate(cfg.email.minSeverity),
      quietHours: quiet(cfg.email.quietHours),
      configured: Boolean(cfg.email.host && cfg.email.from && cfg.email.recipients.length > 0),
    },
    webhook: {
      enabled: cfg.webhook.enabled,
      urls: [...cfg.webhook.urls],
      minSeverity: gate(cfg.webhook.minSeverity),
      quietHours: quiet(cfg.webhook.quietHours),
      format: cfg.webhook.format ?? 'slack',
      signatureSecret: mask(cfg.webhook.signatureSecret ?? ''),
      headers: cfg.webhook.headers ?? null,
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
      minSeverity: gate(cfg.sms.minSeverity),
      quietHours: quiet(cfg.sms.quietHours),
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
      minSeverity: gate(cfg.siem.minSeverity),
      quietHours: quiet(cfg.siem.quietHours),
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
  cfg.webhook.signatureSecret = safeDecrypt(cfg.webhook.signatureSecret ?? '') ?? '';
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

function normalizeSeverityHeader(value: unknown): SeverityGate | undefined {
  if (value === undefined || value === null) return undefined;
  const v = String(value);
  return v in SEVERITY_ORDER ? (v as SeverityGate) : undefined;
}

function normalizeQuietHours(value: unknown): QuietHours | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const q = value as Partial<QuietHours>;
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  const start = typeof q.start === 'string' && timeRe.test(q.start) ? q.start : undefined;
  const end = typeof q.end === 'string' && timeRe.test(q.end) ? q.end : undefined;
  if (!start || !end) return undefined;
  const bypass = Array.isArray(q.bypassFor)
    ? q.bypassFor.filter((s): s is SeverityGate => typeof s === 'string' && s in SEVERITY_ORDER)
    : [];
  return {
    enabled: Boolean(q.enabled),
    start,
    end,
    timezone: typeof q.timezone === 'string' && q.timezone.trim() ? q.timezone.trim() : 'Asia/Jakarta',
    bypassFor: bypass,
  };
}

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['telegram', 'email', 'webhook', 'sms', 'siem'];