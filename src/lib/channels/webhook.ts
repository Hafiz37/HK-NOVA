import { createHmac } from 'crypto';

const MAX_WEBHOOK_BODY = 4000;

export type WebhookFormat = 'slack' | 'discord' | 'teams' | 'generic';

export interface WebhookPayload {
  type: string;
  severity: string;
  deviceName: string;
  deviceIp?: string;
  message: string;
  timestamp: string;
  valueSnapshot?: Record<string, unknown> | null;
  alertId?: string;
}

function truncate(value: string, max = MAX_WEBHOOK_BODY): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

const severityEmoji: Record<string, string> = {
  LOW: '🟢',
  MEDIUM: '🟡',
  HIGH: '🟠',
  CRITICAL: '🔴',
};

/**
 * Bangun body JSON sesuai format tujuan:
 *  - slack  : { text } (WC/plain)
 *  - discord: { content }
 *  - teams  : { "@type", text, title } (MessageCard sederhana)
 *  - generic: payload penuh (type/severity/device/dll) untuk integrasi kustom
 */
export function buildWebhookBody(payload: WebhookPayload, format: WebhookFormat): string {
  const emoji = severityEmoji[payload.severity] || '⚪';
  const text =
    `${emoji} [${payload.severity}] ${payload.type} — ${payload.deviceName}` +
    `${payload.deviceIp ? ` (${payload.deviceIp})` : ''}\n${payload.message}\nTime: ${payload.timestamp}`;

  let body: unknown;
  switch (format) {
    case 'discord':
      body = { content: truncate(text) };
      break;
    case 'teams':
      body = {
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        summary: `[${payload.severity}] ${payload.type}`,
        themeColor: payload.severity === 'CRITICAL' ? 'DC2626' : payload.severity === 'HIGH' ? 'EA580C' : '16A34A',
        sections: [{ text: truncate(text) }],
      };
      break;
    case 'generic':
      body = { ...payload, text, message: truncate(payload.message) };
      break;
    case 'slack':
    default:
      body = { text: truncate(text) };
      break;
  }
  return JSON.stringify(body);
}

/** HMAC-SHA256 signature (hex) untuk verifikasi oleh penerima webhook. */
export function signWebhookBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Kirim notifikasi webhook ke satu atau lebih URL.
 * Mendukung header kustom + signature `X-HK-Nova-Signature: sha256=<hex>`.
 */
export async function sendWebhooks(
  urls: string[],
  payload: WebhookPayload,
  opts: {
    secret?: string;
    headers?: Record<string, string> | null;
    format?: WebhookFormat;
  } = {}
): Promise<boolean> {
  const format = opts.format ?? 'slack';
  const body = buildWebhookBody(payload, format);

  let anySuccess = false;
  for (const url of urls) {
    if (!url) continue;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (opts.headers) {
        Object.entries(opts.headers).forEach(([k, v]) => {
          if (k && v) headers[k] = v;
        });
      }
      if (opts.secret) {
        headers['X-HK-Nova-Signature'] = `sha256=${signWebhookBody(body, opts.secret)}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        anySuccess = true;
      } else {
        console.error(`[Notify] Webhook to ${url} failed: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[Notify] Webhook to ${url} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return anySuccess;
}