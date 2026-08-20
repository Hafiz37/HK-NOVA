import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import {
  getNotificationConfig,
  saveNotificationConfig,
  toPublicNotificationConfig,
  type NotificationConfig,
  type SeverityGate,
  type QuietHours,
} from '@/lib/notify-config';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.*$/;
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

interface ValidationResult {
  errors: string[];
  config?: NotificationConfig;
}

function asStringArray(
  value: unknown,
  label: string,
  errors: string[],
  validator?: (v: string) => boolean
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} harus berupa array`);
    return [];
  }
  const out: string[] = [];
  value.forEach((item, i) => {
    if (typeof item !== 'string' || item.trim() === '') {
      errors.push(`${label}[${i}] bukan string yang valid`);
      return;
    }
    const trimmed = item.trim();
    if (validator && !validator(trimmed)) {
      errors.push(`${label}[${i}] tidak valid: "${trimmed}"`);
      return;
    }
    out.push(trimmed);
  });
  return out;
}

function parseConfig(body: unknown): ValidationResult {
  const errors: string[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Body harus berupa objek konfigurasi'] };
  }
  const b = body as Record<string, unknown>;

  const telegram = (b.telegram ?? {}) as Record<string, unknown>;
  const email = (b.email ?? {}) as Record<string, unknown>;
  const webhook = (b.webhook ?? {}) as Record<string, unknown>;
  const sms = (b.sms ?? {}) as Record<string, unknown>;
  const siem = (b.siem ?? {}) as Record<string, unknown>;

  const chatIds = asStringArray(telegram.chatIds, 'telegram.chatIds', errors);
  const recipients = asStringArray(email.recipients, 'email.recipients', errors, (v) => EMAIL_REGEX.test(v));
  const urls = asStringArray(webhook.urls, 'webhook.urls', errors, (v) => URL_REGEX.test(v));
  const toNumbers = asStringArray(sms.toNumbers, 'sms.toNumbers', errors, (v) => PHONE_REGEX.test(v));
  const siemUrls = asStringArray(siem.urls, 'siem.urls', errors, (v) => URL_REGEX.test(v));

  const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const severityOf = (ch: Record<string, unknown>, name: string): SeverityGate | undefined => {
    const v = ch.minSeverity;
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || !SEVERITIES.includes(v)) {
      errors.push(`${name}.minSeverity harus salah satu dari: ${SEVERITIES.join(', ')}`);
      return undefined;
    }
    return v as SeverityGate;
  };
  const telegramGate = severityOf(telegram, 'telegram');
  const emailGate = severityOf(email, 'email');
  const webhookGate = severityOf(webhook, 'webhook');
  const smsGate = severityOf(sms, 'sms');
  const siemGate = severityOf(siem, 'siem');

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const quietHoursOf = (ch: Record<string, unknown>, name: string): QuietHours | undefined => {
    const q = ch.quietHours;
    if (q === undefined || q === null) return undefined;
    if (typeof q !== 'object') {
      errors.push(`${name}.quietHours harus berupa objek`);
      return undefined;
    }
    const qq = q as Record<string, unknown>;
    const start = qq.start;
    const end = qq.end;
    const timezone = qq.timezone;
    if (start && (typeof start !== 'string' || !TIME_RE.test(start))) {
      errors.push(`${name}.quietHours.start harus format HH:MM`);
      return undefined;
    }
    if (end && (typeof end !== 'string' || !TIME_RE.test(end))) {
      errors.push(`${name}.quietHours.end harus format HH:MM`);
      return undefined;
    }
    const trueStart = typeof start === 'string' ? start : undefined;
    const trueEnd = typeof end === 'string' ? end : undefined;
    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const bypass = Array.isArray(qq.bypassFor)
      ? qq.bypassFor.filter((s) => typeof s === 'string' && validSeverities.includes(s) && !errors.includes(`${name}.quietHours.bypassFor tidak valid`))
      : [];
    return {
      enabled: Boolean(qq.enabled),
      start: trueStart ?? '22:00',
      end: trueEnd ?? '06:00',
      timezone: typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'Asia/Jakarta',
      bypassFor: bypass as SeverityGate[],
    };
  };
  const telegramQuiet = quietHoursOf(telegram, 'telegram');
  const emailQuiet = quietHoursOf(email, 'email');
  const webhookQuiet = quietHoursOf(webhook, 'webhook');
  const smsQuiet = quietHoursOf(sms, 'sms');
  const siemQuiet = quietHoursOf(siem, 'siem');

  if (siem.format !== undefined && !['generic', 'splunk'].includes(siem.format as string)) {
    errors.push('siem.format harus "generic" atau "splunk"');
  }

  const emailPort = email.port === undefined ? 465 : Number(email.port);
  if (Number.isNaN(emailPort) || emailPort <= 0 || emailPort > 65535) {
    errors.push('email.port harus berupa angka 1-65535');
  }

  const smsProvider = sms.provider === 'twilio' ? 'twilio' : 'generic';
  if (sms.provider !== undefined && !['generic', 'twilio'].includes(sms.provider as string)) {
    errors.push('sms.provider harus "generic" atau "twilio"');
  }

  if (errors.length > 0) return { errors };

  const config: NotificationConfig = {
    telegram: {
      enabled: Boolean(telegram.enabled),
      botToken: typeof telegram.botToken === 'string' ? telegram.botToken : '',
      chatIds,
      minSeverity: telegramGate,
      quietHours: telegramQuiet,
    },
    email: {
      enabled: Boolean(email.enabled),
      host: typeof email.host === 'string' ? email.host.trim() : '',
      port: emailPort,
      secure: email.secure === undefined ? true : Boolean(email.secure),
      username: typeof email.username === 'string' ? email.username.trim() : '',
      password: typeof email.password === 'string' ? email.password : '',
      from: typeof email.from === 'string' ? email.from.trim() : '',
      recipients,
      minSeverity: emailGate,
      quietHours: emailQuiet,
    },
    webhook: {
      enabled: Boolean(webhook.enabled),
      urls,
      minSeverity: webhookGate,
      quietHours: webhookQuiet,
      format: webhook.format && ['slack', 'discord', 'teams', 'generic'].includes(webhook.format as string)
        ? (webhook.format as 'slack' | 'discord' | 'teams' | 'generic')
        : 'slack',
      signatureSecret: typeof webhook.signatureSecret === 'string' ? webhook.signatureSecret : '',
      headers: webhook.headers && typeof webhook.headers === 'object' ? (webhook.headers as Record<string, string>) : null,
    },
    sms: {
      enabled: Boolean(sms.enabled),
      provider: smsProvider,
      apiUrl: typeof sms.apiUrl === 'string' ? sms.apiUrl.trim() : '',
      apiKey: typeof sms.apiKey === 'string' ? sms.apiKey : '',
      accountSid: typeof sms.accountSid === 'string' ? sms.accountSid.trim() : '',
      senderId: typeof sms.senderId === 'string' ? sms.senderId.trim() : '',
      toNumbers,
      minSeverity: smsGate,
      quietHours: smsQuiet,
    },
    siem: {
      enabled: Boolean(siem.enabled),
      urls: siemUrls,
      token: typeof siem.token === 'string' ? siem.token : '',
      format: siem.format === 'splunk' ? 'splunk' : 'generic',
      minSeverity: siemGate,
      quietHours: siemQuiet,
    },
  };

  return { errors: [], config };
}

/**
 * GET /api/settings/notifications
 * Returns the notification channel config with secrets masked. ADMIN only.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const cfg = await getNotificationConfig(prisma);
    return NextResponse.json({ data: toPublicNotificationConfig(cfg) });
  } catch (error) {
    console.error('[API /api/settings/notifications GET] Error:', error);
    return NextResponse.json({ error: 'Gagal membaca konfigurasi notifikasi' }, { status: 500 });
  }
}

/**
 * POST /api/settings/notifications
 * Saves the notification channel config. Secrets left as ***MASKED*** keep
 * their previously stored value. ADMIN only.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.settings, 'settings:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    const { errors, config } = parseConfig(body);
    if (!config) {
      return NextResponse.json({ error: errors[0] || 'Konfigurasi tidak valid', details: errors }, { status: 400 });
    }

    const before = await toPublicNotificationConfig(await getNotificationConfig(prisma));
    await saveNotificationConfig(prisma, config);
    const after = await toPublicNotificationConfig(await getNotificationConfig(prisma));

    await logAudit({
      action: 'UPDATE',
      entity: 'Setting',
      entityId: 'notify:channels',
      userId: auth.user.id,
      details: {
        before,
        after,
        fieldsChanged: ['notification-channels'],
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ data: after, message: 'Konfigurasi notifikasi berhasil disimpan' });
  } catch (error) {
    console.error('[API /api/settings/notifications POST] Error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan konfigurasi notifikasi' }, { status: 500 });
  }
}