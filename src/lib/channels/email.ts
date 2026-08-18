import nodemailer from 'nodemailer';
import type { EmailChannelConfig } from '../notify-config';

const transportCache = new Map<string, ReturnType<typeof nodemailer.createTransport>>();

function getTransport(cfg: EmailChannelConfig) {
  const cacheKey = `${cfg.host}:${cfg.port}:${cfg.username}`;
  let transport = transportCache.get(cacheKey);
  if (!transport) {
    transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth:
        cfg.username && cfg.password
          ? { user: cfg.username, pass: cfg.password }
          : undefined,
    });
    transportCache.set(cacheKey, transport);
  }
  return transport;
}

/**
 * Send an HTML email to one or more recipients via SMTP (nodemailer).
 * Requires host + from + at least one recipient.
 */
export async function sendEmail(
  cfg: EmailChannelConfig,
  subject: string,
  html: string
): Promise<boolean> {
  const recipients = cfg.recipients.filter(Boolean);
  if (!cfg.host || !cfg.from || recipients.length === 0) return false;

  try {
    const transport = getTransport(cfg);
    await transport.sendMail({
      from: cfg.from,
      to: recipients.join(', '),
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error('[Notify] Failed to send email notification:', err);
    return false;
  }
}

const severityEmoji: Record<string, string> = {
  LOW: '🟢',
  MEDIUM: '🟡',
  HIGH: '🟠',
  CRITICAL: '🔴',
};

export function formatEmailSubject(type: string, severity: string, deviceName: string): string {
  return `[HK-NOVA ${severity}] ${type} — ${deviceName}`;
}

export function formatEmailHtml(
  type: string,
  severity: string,
  deviceName: string,
  deviceIp: string,
  message: string
): string {
  const emoji = severityEmoji[severity] || '⚪';
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  return `
<!DOCTYPE html>
<html lang="id">
<body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0f172a;color:#0f172a;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.25);">
    <div style="padding:24px 32px;background:${severity === 'CRITICAL' ? '#dc2626' : severity === 'HIGH' ? '#ea580c' : severity === 'MEDIUM' ? '#ca8a04' : '#16a34a'};">
      <h1 style="margin:0;font-size:18px;color:#ffffff;">${emoji} HK-NOVA Alert — ${escapeHtml(severity)}</h1>
    </div>
    <div style="padding:24px 32px;">
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;line-height:1.6;">
        <tr><td style="padding:6px 0;color:#64748b;width:110px;">Alert</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(type)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Device</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(deviceName)}</td></tr>
        ${escapeHtml(deviceIp) ? `<tr><td style="padding:6px 0;color:#64748b;">IP</td><td style="padding:6px 0;">${escapeHtml(deviceIp)}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#64748b;">Severity</td><td style="padding:6px 0;"><span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${severity === 'CRITICAL' ? '#fee2e2' : severity === 'HIGH' ? '#ffedd5' : severity === 'MEDIUM' ? '#fef9c3' : '#dcfce7'};color:${severity === 'CRITICAL' ? '#b91c1c' : severity === 'HIGH' ? '#c2410c' : severity === 'MEDIUM' ? '#a16207' : '#15803d'};">${escapeHtml(severity)}</span></td></tr>
        <tr><td style="padding:6px 0;color:#64748b;vertical-align:top;">Pesan</td><td style="padding:6px 0;">${escapeHtml(message)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Waktu</td><td style="padding:6px 0;">${escapeHtml(time)}</td></tr>
      </table>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}