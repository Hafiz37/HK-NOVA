import { sendTelegramToChats, formatTelegramMessage } from './channels/telegram';

/**
 * Telegram notification helper (backward-compatible with the original module).
 * Reads token/chat IDs from env; TELEGRAM_CHAT_ID may contain multiple
 * comma-separated chat IDs for multi-recipient delivery.
 */
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chatIds = (process.env.TELEGRAM_CHAT_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function sendTelegramNotification(message: string): Promise<boolean> {
  if (!token || chatIds.length === 0) {
    console.warn('Telegram not configured. Message:', message);
    return false;
  }
  return sendTelegramToChats(token, chatIds, message);
}

/** Format an alert as a Telegram HTML message. */
export function formatAlertMessage(
  type: string,
  severity: string,
  deviceName: string,
  message: string
): string {
  return formatTelegramMessage(type, severity, deviceName, message);
}