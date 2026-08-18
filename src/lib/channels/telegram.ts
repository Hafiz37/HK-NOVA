import TelegramBot from 'node-telegram-bot-api';
import { escapeHtml } from '../utils';

const botCache = new Map<string, TelegramBot>();

function getBot(token: string): TelegramBot | null {
  if (!token) return null;
  let bot = botCache.get(token);
  if (!bot) {
    bot = new TelegramBot(token, { polling: false });
    botCache.set(token, bot);
  }
  return bot;
}

/**
 * Send an HTML-formatted message to one or more Telegram chat IDs.
 * Returns true if at least one recipient accepted the message.
 */
export async function sendTelegramToChats(
  token: string,
  chatIds: string[],
  htmlMessage: string
): Promise<boolean> {
  const bot = getBot(token);
  if (!bot) return false;

  let anySuccess = false;
  for (const chatId of chatIds) {
    if (!chatId) continue;
    try {
      await bot.sendMessage(chatId, htmlMessage, { parse_mode: 'HTML' });
      anySuccess = true;
    } catch (err) {
      console.error(`[Notify] Failed to send Telegram to chat ${chatId}:`, err);
    }
  }
  return anySuccess;
}

const severityEmoji: Record<string, string> = {
  LOW: '🟢',
  MEDIUM: '🟡',
  HIGH: '🟠',
  CRITICAL: '🔴',
};

export function formatTelegramMessage(
  type: string,
  severity: string,
  deviceName: string,
  message: string
): string {
  const emoji = severityEmoji[severity] || '⚪';

  return `
${emoji} <b>${escapeHtml(type)}</b>

<b>Device:</b> ${escapeHtml(deviceName)}
<b>Severity:</b> ${escapeHtml(severity)}
<b>Message:</b> ${escapeHtml(message)}
<b>Time:</b> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
  `.trim();
}