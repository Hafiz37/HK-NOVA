import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? '365');
const SOFT_DELETE_GRACE_DAYS = Number(process.env.BACKUP_SOFT_DELETE_GRACE_DAYS ?? '30');
const CLEANUP_SCHEDULE = process.env.BACKUP_CLEANUP_SCHEDULE ?? '0 4 * * *'; // 04:00 daily

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [BACKUP-RETENTION] [${level}] ${message}${metaStr}`);
}

async function runRetentionCycle(): Promise<void> {
  const cycleStart = Date.now();
  log('INFO', 'Starting retention cleanup cycle');

  try {
    // Step 1: Soft delete expired backups
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - DEFAULT_RETENTION_DAYS);

    const softDeleted = await prisma.backup.updateMany({
      where: {
        timestamp: { lt: expiryDate },
        deletedAt: null,
        isProtected: false,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    log('INFO', `Soft-deleted ${softDeleted.count} expired backups (older than ${DEFAULT_RETENTION_DAYS} days)`);

    // Step 2: Hard delete after grace period
    const hardDeleteDate = new Date();
    hardDeleteDate.setDate(hardDeleteDate.getDate() - SOFT_DELETE_GRACE_DAYS);

    const hardDeleted = await prisma.backup.deleteMany({
      where: {
        deletedAt: { lt: hardDeleteDate },
        isProtected: false,
      },
    });

    log('INFO', `Hard-deleted ${hardDeleted.count} backups after grace period`);

    // Step 3: Ensure minimum 1 backup per device
    const devices = await prisma.device.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    let protectedCount = 0;
    for (const device of devices) {
      const backupCount = await prisma.backup.count({
        where: { deviceId: device.id, deletedAt: null },
      });

      if (backupCount === 0) {
        // Restore latest soft-deleted backup
        const latest = await prisma.backup.findFirst({
          where: { deviceId: device.id, deletedAt: { not: null } },
          orderBy: { timestamp: 'desc' },
        });

        if (latest) {
          await prisma.backup.update({
            where: { id: latest.id },
            data: { deletedAt: null, isProtected: true },
          });
          protectedCount++;
          log('WARN', `Restored backup for device ${device.id} (minimum 1 backup policy)`);
        }
      }
    }

    log('INFO', `Protected ${protectedCount} backups to maintain minimum coverage`);

    // Step 4: Collect metrics
    const stats = await prisma.backup.aggregate({
      _count: true,
      _sum: { sizeBytes: true, compressedBytes: true },
      where: { deletedAt: null },
    });

    const elapsed = Date.now() - cycleStart;
    log('INFO', `Retention cycle completed in ${elapsed}ms`, {
      totalBackups: stats._count,
      totalSizeMB: ((stats._sum.sizeBytes ?? 0) / 1024 / 1024).toFixed(2),
      compressedMB: ((stats._sum.compressedBytes ?? 0) / 1024 / 1024).toFixed(2),
    });
  } catch (err) {
    log('ERROR', 'Retention cycle failed', err instanceof Error ? err.message : err);
  }
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

// Start scheduler
log('INFO', `Backup Retention Worker starting with schedule: "${CLEANUP_SCHEDULE}"`);
log('INFO', `Retention policy: ${DEFAULT_RETENTION_DAYS} days, grace period: ${SOFT_DELETE_GRACE_DAYS} days`);

cron.schedule(CLEANUP_SCHEDULE, () => {
  if (!isShuttingDown) {
    void runRetentionCycle();
  }
});

// Run immediately on startup
void runRetentionCycle();

log('INFO', 'Backup Retention Worker is running. Press Ctrl+C to stop.');