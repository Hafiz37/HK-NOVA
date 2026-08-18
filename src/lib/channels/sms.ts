import type { SmsChannelConfig } from '../notify-config';

const MAX_SMS_LENGTH = 160;

function truncate(value: string, max = MAX_SMS_LENGTH): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function buildSmsBody(text: string): string {
  return truncate(text);
}

/**
 * Send an SMS to one or more numbers.
 * - provider "generic": POST JSON `{ api_key, sender_id, to, message }` to apiUrl.
 * - provider "twilio":  Twilio REST API (form-encoded, basic auth).
 */
export async function sendSms(cfg: SmsChannelConfig, text: string): Promise<boolean> {
  const toNumbers = cfg.toNumbers.filter(Boolean);
  if (toNumbers.length === 0) return false;

  if (cfg.provider === 'twilio') {
    return sendTwilio(cfg, toNumbers, text);
  }

  if (!cfg.apiUrl) return false;

  let anySuccess = false;
  for (const to of toNumbers) {
    try {
      const res = await fetch(cfg.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({
          api_key: cfg.apiKey || undefined,
          sender_id: cfg.senderId || undefined,
          to,
          message: buildSmsBody(text),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        anySuccess = true;
      } else {
        console.error(`[Notify] SMS gateway to ${to} failed: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[Notify] SMS gateway to ${to} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return anySuccess;
}

async function sendTwilio(cfg: SmsChannelConfig, toNumbers: string[], text: string): Promise<boolean> {
  const accountSid = cfg.accountSid;
  const authToken = cfg.apiKey;
  if (!accountSid || !authToken) return false;

  const baseUrl = cfg.apiUrl || `https://api.twilio.com/2010-04-01`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  let anySuccess = false;
  for (const to of toNumbers) {
    try {
      const body = new URLSearchParams({
        From: cfg.senderId,
        To: to,
        Body: buildSmsBody(text),
      });
      const res = await fetch(`${baseUrl}/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        anySuccess = true;
      } else {
        console.error(`[Notify] Twilio to ${to} failed: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[Notify] Twilio to ${to} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return anySuccess;
}