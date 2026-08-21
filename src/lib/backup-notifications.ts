import { PrismaClient } from '@prisma/client';
import { calculateBackupHealth } from './backup-health';

export interface NotificationConfig {
  enabled: boolean;
  channels: ('telegram' | 'email' | 'webhook')[];
  // Daily digest
  dailyDigestEnabled: boolean;
  dailyDigestTime: string; // HH:MM format
  dailyDigestChannels: ('telegram' | 'email' | 'webhook')[];
  // Critical change alerts
  criticalChangeAlertsEnabled: boolean;
  criticalChangeChannels: ('telegram' | 'email' | 'webhook')[];
  // Storage alerts
  storageAlertEnabled: boolean;
  storageAlertThresholdPercent: number; // e.g., 80
  storageAlertChannels: ('telegram' | 'email' | 'webhook')[];
  // Failed backup alerts
  failedBackupAlertEnabled: boolean;
  failedBackupThreshold: number; // consecutive failures
  failedBackupChannels: ('telegram' | 'email' | 'webhook')[];
  // Webhook URLs
  webhookUrl?: string;
  // Email recipients
  emailRecipients?: string[];
}

export const DEFAULT_CONFIG: NotificationConfig = {
  enabled: true,
  channels: ['telegram'],
  dailyDigestEnabled: true,
  dailyDigestTime: '08:00',
  dailyDigestChannels: ['telegram'],
  criticalChangeAlertsEnabled: true,
  criticalChangeChannels: ['telegram'],
  storageAlertEnabled: true,
  storageAlertThresholdPercent: 80,
  storageAlertChannels: ['telegram'],
  failedBackupAlertEnabled: true,
  failedBackupThreshold: 3,
  failedBackupChannels: ['telegram'],
};

export interface DailyDigestData {
  date: string;
  totalDevices: number;
  devicesBackedUp: number;
  coverage: number;
  successfulBackups: number;
  failedBackups: number;
  successRate: number;
  criticalChanges: number;
  highChanges: number;
  devicesNeverBackedUp: number;
  topFailedDevices: { name: string; ip: string; error: string }[];
  storageUsedMB: number;
  healthScore: number;
  healthGrade: string;
}

export interface CriticalChangeAlert {
  deviceName: string;
  deviceIp: string;
  timestamp: Date;
  severity: string;
  section: string;
  preview: string;
  backupId: string;
}

/**
 * Generate daily digest data
 */
export async function generateDailyDigest(
  prisma: PrismaClient,
  date: Date = new Date()
): Promise<DailyDigestData> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get all devices
  const devices = await prisma.device.findMany({
    where: { deletedAt: null, isDemo: false, backupEnabled: true },
    select: { id: true, name: true, ip: true },
  });

  // Get backups for today
  const backups = await prisma.backup.findMany({
    where: {
      timestamp: { gte: startOfDay, lte: endOfDay },
    },
    select: {
      id: true,
      deviceId: true,
      status: true,
      errorMessage: true,
      riskScore: true,
      changesSummary: true,
      sizeBytes: true,
      compressedBytes: true,
    },
  });

  const successfulBackups = backups.filter(b => b.status === 'SUCCESS');
  const failedBackups = backups.filter(b => b.status === 'FAILED');
  const devicesBackedUp = new Set(successfulBackups.map(b => b.deviceId));

  // Get critical/high changes
  let criticalChanges = 0;
  let highChanges = 0;
  for (const backup of successfulBackups) {
    const cs = backup.changesSummary as any;
    if (cs) {
      criticalChanges += cs.critical || 0;
      highChanges += cs.high || 0;
    }
  }

  // Get failed devices detail
  const failedDevices = failedBackups.map(b => {
    const device = devices.find(d => d.id === b.deviceId);
    return {
      name: device?.name ?? 'Unknown',
      ip: device?.ip ?? 'Unknown',
      error: b.errorMessage ?? 'Unknown error',
    };
  });

  // Storage
  const storageUsed = backups.reduce((sum, b) => sum + (b.compressedBytes || 0), 0);

  // Health score
  const health = await calculateBackupHealth(prisma);

  return {
    date: date.toLocaleDateString('id-ID'),
    totalDevices: devices.length,
    devicesBackedUp: devicesBackedUp.size,
    coverage: devices.length > 0 ? Math.round((devicesBackedUp.size / devices.length) * 100) : 0,
    successfulBackups: successfulBackups.length,
    failedBackups: failedBackups.length,
    successRate: backups.length > 0 ? Math.round((successfulBackups.length / backups.length) * 100) : 100,
    criticalChanges,
    highChanges,
    devicesNeverBackedUp: devices.length - devicesBackedUp.size,
    topFailedDevices: failedDevices.slice(0, 5),
    storageUsedMB: Math.round(storageUsed / 1024 / 1024 * 100) / 100,
    healthScore: health.score,
    healthGrade: health.grade,
  };
}

/**
 * Get critical changes for alerting (last 24 hours)
 */
export async function getCriticalChangesForAlert(
  prisma: PrismaClient,
  since: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)
): Promise<CriticalChangeAlert[]> {
  const backups = await prisma.backup.findMany({
    where: {
      timestamp: { gte: since },
      status: 'SUCCESS',
    },
    select: {
      id: true,
      deviceId: true,
      timestamp: true,
      criticalChanges: true,
      changesSummary: true,
    },
  });

  const alerts: CriticalChangeAlert[] = [];
  for (const backup of backups) {
    const cc = backup.criticalChanges as any[];
    if (cc && cc.length > 0) {
      // Get device info
      const device = await prisma.device.findUnique({
        where: { id: backup.deviceId },
        select: { name: true, ip: true },
      });

      for (const change of cc) {
        if (change.severity === 'CRITICAL' || change.severity === 'HIGH') {
          alerts.push({
            deviceName: device?.name ?? 'Unknown',
            deviceIp: device?.ip ?? 'Unknown',
            timestamp: backup.timestamp,
            severity: change.severity,
            section: change.section,
            preview: change.preview,
            backupId: backup.id,
          });
        }
      }
    }
  }

  return alerts;
}

/**
 * Send notification via configured channels
 */
export async function sendNotification(
  config: NotificationConfig,
  subject: string,
  message: string,
  channels: ('telegram' | 'email' | 'webhook')[] = config.channels
): Promise<void> {
  if (!config.enabled) return;

  for (const channel of channels) {
    try {
      switch (channel) {
        case 'telegram':
          await sendTelegram(subject, message);
          break;
        case 'email':
          await sendEmail(config.emailRecipients ?? [], subject, message);
          break;
        case 'webhook':
          await sendWebhook(config.webhookUrl ?? '', subject, message);
          break;
      }
    } catch (err) {
      console.error(`[NOTIFICATION] Failed to send via ${channel}:`, err);
    }
  }
}

async function sendTelegram(subject: string, message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn('[NOTIFICATION] Telegram not configured');
    return;
  }

  const text = `<b>${subject}</b>\n\n${message}`;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.statusText}`);
  }
}

async function sendEmail(recipients: string[], subject: string, message: string): Promise<void> {
  // This would integrate with your email service (nodemailer, etc.)
  // For now, just log
  console.log(`[NOTIFICATION] Email to ${recipients.join(', ')}: ${subject}`);
  // TODO: Implement actual email sending
}

async function sendWebhook(webhookUrl: string, subject: string, message: string): Promise<void> {
  if (!webhookUrl) {
    console.warn('[NOTIFICATION] Webhook URL not configured');
    return;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject,
      message,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Webhook error: ${response.statusText}`);
  }
}

/**
 * Format daily digest for Telegram
 */
export function formatDailyDigestForTelegram(data: DailyDigestData): { subject: string; message: string } {
  const gradeEmoji = data.healthGrade === 'A' ? '🟢' :
    data.healthGrade === 'B' ? '🔵' :
    data.healthGrade === 'C' ? '🟡' :
    data.healthGrade === 'D' ? '🟠' : '🔴';

  const statusEmoji = data.successRate === 100 ? '✅' :
    data.successRate >= 90 ? '⚠️' : '❌';

  const message = `
${gradeEmoji} <b>Health Score: ${data.healthScore}/100 (Grade ${data.healthGrade})</b>
${statusEmoji} <b>Success Rate: ${data.successRate}%</b>

📊 <b>Coverage</b>
• Devices: ${data.devicesBackedUp}/${data.totalDevices} (${data.coverage}%)
• Successful: ${data.successfulBackups}
• Failed: ${data.failedBackups}
• Never backed up: ${data.devicesNeverBackedUp}

🔴 <b>Changes Detected</b>
• Critical: ${data.criticalChanges}
• High: ${data.highChanges}

💾 <b>Storage: ${data.storageUsedMB} MB</b>
  `.trim();

  return {
    subject: `📅 Daily Backup Digest - ${data.date}`,
    message,
  };
}

/**
 * Format critical change alert for Telegram
 */
export function formatCriticalChangeAlert(alert: CriticalChangeAlert): { subject: string; message: string } {
  const severityEmoji = alert.severity === 'CRITICAL' ? '🔴' : '🟠';

  const message = `
${severityEmoji} <b>${alert.severity} Change Detected</b>

📱 <b>Device:</b> ${alert.deviceName} (${alert.deviceIp})
📂 <b>Section:</b> ${alert.section}
🕐 <b>Time:</b> ${new Date(alert.timestamp).toLocaleString('id-ID')}

📝 <b>Change:</b> ${alert.preview}
  `.trim();

  return {
    subject: `${severityEmoji} ${alert.severity} Config Change - ${alert.deviceName}`,
    message,
  };
}