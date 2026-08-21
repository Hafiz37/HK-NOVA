import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import {
  generateDailyDigest,
  getCriticalChangesForAlert,
  sendNotification,
  formatDailyDigestForTelegram,
  formatCriticalChangeAlert,
  DEFAULT_CONFIG,
  NotificationConfig,
} from '../lib/backup-notifications';

const prisma = new PrismaClient();

// Load config from env
const config: NotificationConfig = {
  ...DEFAULT_CONFIG,
  enabled: process.env.BACKUP_NOTIFICATIONS_ENABLED !== 'false',
  dailyDigestEnabled: process.env.BACKUP_DAILY_DIGEST_ENABLED !== 'false',
  dailyDigestTime: process.env.BACKUP_DAILY_DIGEST_TIME || '08:00',
  criticalChangeAlertsEnabled: process.env.BACKUP_CRITICAL_ALERTS_ENABLED !== 'false',
  storageAlertEnabled: process.env.BACKUP_STORAGE_ALERTS_ENABLED !== 'false',
  storageAlertThresholdPercent: Number(process.env.BACKUP_STORAGE_ALERT_THRESHOLD || '80'),
  failedBackupAlertEnabled: process.env.BACKUP_FAILED_ALERTS_ENABLED !== 'false',
  failedBackupThreshold: Number(process.env.BACKUP_FAILED_ALERT_THRESHOLD || '3'),
  webhookUrl: process.env.BACKUP_WEBHOOK_URL,
  emailRecipients: process.env.BACKUP_EMAIL_RECIPIENTS?.split(',').filter(Boolean),
};

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [BACKUP-NOTIFICATIONS] [${level}] ${message}${metaStr}`);
}

// Track last alert times to prevent spam
const lastAlertTimes = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown per device

function canAlert(deviceId: string): boolean {
  const lastTime = lastAlertTimes.get(deviceId) || 0;
  if (Date.now() - lastTime > ALERT_COOLDOWN_MS) {
    lastAlertTimes.set(deviceId, Date.now());
    return true;
  }
  return false;
}

async function sendDailyDigest(): Promise<void> {
  if (!config.dailyDigestEnabled) {
    log('INFO', 'Daily digest disabled');
    return;
  }

  log('INFO', 'Generating daily digest...');
  try {
    const digest = await generateDailyDigest(prisma);
    const { subject, message } = formatDailyDigestForTelegram(digest);

    await sendNotification(config, subject, message, config.dailyDigestChannels);
    log('INFO', 'Daily digest sent successfully');
  } catch (err) {
    log('ERROR', 'Failed to send daily digest', err instanceof Error ? err.message : err);
  }
}

async function checkCriticalChanges(): Promise<void> {
  if (!config.criticalChangeAlertsEnabled) {
    log('INFO', 'Critical change alerts disabled');
    return;
  }

  log('INFO', 'Checking for critical changes...');
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
    const alerts = await getCriticalChangesForAlert(prisma, since);

    let sentCount = 0;
    for (const alert of alerts) {
      // Get device ID for cooldown check
      const device = await prisma.device.findFirst({
        where: { name: alert.deviceName, ip: alert.deviceIp },
        select: { id: true },
      });

      if (device && canAlert(device.id)) {
        const { subject, message } = formatCriticalChangeAlert(alert);
        await sendNotification(config, subject, message, config.criticalChangeChannels);
        sentCount++;
      }
    }

    log('INFO', `Critical change check completed, ${sentCount} alerts sent`);
  } catch (err) {
    log('ERROR', 'Failed to check critical changes', err instanceof Error ? err.message : err);
  }
}

async function checkStorageAlerts(): Promise<void> {
  if (!config.storageAlertEnabled) {
    return;
  }

  log('INFO', 'Checking storage alerts...');
  try {
    const backups = await prisma.backup.findMany({
      where: { deletedAt: null },
      select: { compressedBytes: true },
    });

    const totalBytes = backups.reduce((sum, b) => sum + (b.compressedBytes || 0), 0);
    const totalMB = totalBytes / 1024 / 1024;

    // Assume 10GB limit for warning (configurable)
    const limitMB = 10 * 1024; // 10GB
    const usagePercent = (totalMB / limitMB) * 100;

    if (usagePercent >= config.storageAlertThresholdPercent) {
      const { subject, message } = formatStorageAlert(totalMB, limitMB, usagePercent);
      await sendNotification(config, subject, message, config.storageAlertChannels);
      log('WARN', `Storage alert sent: ${usagePercent.toFixed(1)}% used`);
    }
  } catch (err) {
    log('ERROR', 'Failed to check storage alerts', err instanceof Error ? err.message : err);
  }
}

function formatStorageAlert(usedMB: number, limitMB: number, percent: number): { subject: string; message: string } {
  const message = `
⚠️ <b>Backup Storage Alert</b>

💾 <b>Current Usage:</b> ${usedMB.toFixed(1)} MB / ${(limitMB / 1024).toFixed(1)} GB
📊 <b>Usage:</b> ${percent.toFixed(1)}% (threshold: ${config.storageAlertThresholdPercent}%)

Consider enabling tiered storage (BACKUP_STORAGE_TIERED=true) or cleaning up old backups.
  `.trim();

  return {
    subject: `⚠️ Backup Storage Alert - ${percent.toFixed(1)}% Used`,
    message,
  };
}

async function checkFailedBackupAlerts(): Promise<void> {
  if (!config.failedBackupAlertEnabled) {
    return;
  }

  log('INFO', 'Checking failed backup alerts...');
  try {
    // Check last 24 hours for devices with consecutive failures
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const failedBackups = await prisma.backup.findMany({
      where: {
        timestamp: { gte: since },
        status: 'FAILED',
      },
      select: { deviceId: true, errorMessage: true, timestamp: true },
      orderBy: { timestamp: 'desc' },
    });

    // Group by device
    const failuresByDevice = new Map<string, { count: number; errors: string[] }>();
    for (const fb of failedBackups) {
      const existing = failuresByDevice.get(fb.deviceId) || { count: 0, errors: [] };
      existing.count++;
      if (fb.errorMessage) existing.errors.push(fb.errorMessage);
      failuresByDevice.set(fb.deviceId, existing);
    }

    for (const [deviceId, data] of failuresByDevice) {
      if (data.count >= config.failedBackupThreshold && canAlert(deviceId)) {
        const device = await prisma.device.findUnique({
          where: { id: deviceId },
          select: { name: true, ip: true },
        });

        const message = `
🚨 <b>Consecutive Backup Failures</b>

📱 <b>Device:</b> ${device?.name ?? 'Unknown'} (${device?.ip ?? 'Unknown'})
🔢 <b>Failures (24h):</b> ${data.count}
📝 <b>Errors:</b> ${data.errors.slice(0, 3).join('; ')}
        `.trim();

        await sendNotification(config, `🚨 Backup Failures - ${device?.name ?? deviceId}`, message, config.failedBackupChannels);
        log('WARN', `Failed backup alert sent for device ${deviceId}`);
      }
    }
  } catch (err) {
    log('ERROR', 'Failed to check failed backup alerts', err instanceof Error ? err.message : err);
  }
}

async function runAllChecks(): Promise<void> {
  log('INFO', 'Running notification checks...');
  await Promise.all([
    sendDailyDigest(),
    checkCriticalChanges(),
    checkStorageAlerts(),
    checkFailedBackupAlerts(),
  ]);
  log('INFO', 'All notification checks completed');
}

// Schedule
function scheduleDailyDigest(): void {
  if (!config.dailyDigestEnabled) return;

  const [hour, minute] = config.dailyDigestTime.split(':').map(Number);
  const cronExpr = `${minute} ${hour} * * *`;

  cron.schedule(cronExpr, () => {
    log('INFO', 'Daily digest cron triggered');
    void sendDailyDigest();
  });

  log('INFO', `Daily digest scheduled: ${cronExpr} (${config.dailyDigestTime})`);
}

function scheduleCriticalChecks(): void {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    void checkCriticalChanges();
  });

  // Run every 6 hours
  cron.schedule('0 */6 * * *', () => {
    void checkStorageAlerts();
    void checkFailedBackupAlerts();
  });

  log('INFO', 'Critical checks scheduled: hourly for changes, 6-hourly for storage/failed');
}

// Graceful shutdown
let isShuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('INFO', `Received ${signal}, shutting down...`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// Startup
log('INFO', 'Backup Notification Worker starting...');
log('INFO', `Config: enabled=${config.enabled}, dailyDigest=${config.dailyDigestEnabled}, criticalAlerts=${config.criticalChangeAlertsEnabled}`);

scheduleDailyDigest();
scheduleCriticalChecks();

// Run initial checks
void runAllChecks();

log('INFO', 'Backup Notification Worker is running. Press Ctrl+C to stop.');