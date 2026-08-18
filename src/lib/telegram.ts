import TelegramBot from 'node-telegram-bot-api';
import { escapeHtml } from './utils';

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '';

let bot: TelegramBot | null = null;

if (token && chatId) {
  bot = new TelegramBot(token, { polling: false });
}

export async function sendTelegramNotification(message: string): Promise<boolean> {
  if (!bot || !chatId) {
    console.warn('Telegram not configured. Message:', message);
    return false;
  }

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    return true;
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
    return false;
  }
}

export function formatAlertMessage(
  type: string,
  severity: string,
  deviceName: string,
  message: string
): string {
  const severityEmoji = {
    LOW: '🟢',
    MEDIUM: '🟡',
    HIGH: '🟠',
    CRITICAL: '🔴',
  };

  const emoji = severityEmoji[severity as keyof typeof severityEmoji] || '⚪';

  return `
${emoji} <b>${escapeHtml(type)}</b>

<b>Device:</b> ${escapeHtml(deviceName)}
<b>Severity:</b> ${escapeHtml(severity)}
<b>Message:</b> ${escapeHtml(message)}
<b>Time:</b> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
  `.trim();
}
