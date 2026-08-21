import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { archiveBackup } from '../lib/backup-storage';

const prisma = new PrismaClient();

const HOT_DAYS = Number(process.env.BACKUP_HOT_DAYS ?? '30');
const ARCHIVE_SCHEDULE = process.env.BACKUP_ARCHIVE_SCHEDULE ?? '0 3 * * *'; // 03:00 daily
const TIERED_ENABLED = process.env.BACKUP_STORAGE_TIERED === 'true';
const BATCH_SIZE = Number(process.env.BACKUP_ARCHIVE_BATCH_SIZE ?? '100');

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [BACKUP-ARCHIVE] [${level}] ${message}${metaStr}`);
}

async function runArchiveCycle(): Promise<void> {
  if (!TIERED_ENABLED) {
    log('INFO', 'Tiered storage disabled, skipping archive cycle');
    return;
  }

  const cycleStart = Date.now();
  log('INFO', `Starting archive cycle (HOT tier: ${HOT_DAYS} days)`);

  try {
    // Find backups older than HOT_DAYS still in database
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - HOT_DAYS);

    const candidates = await prisma.backup.findMany({
      where: {
        timestamp: { lt: cutoffDate },
        storageLocation: 'database',
        configContent: { not: null },
        deletedAt: null,
        isProtected: false,
      },
      select: { id: true, deviceId: true, timestamp: true },
      orderBy: { timestamp: 'asc' },
      take: BATCH_SIZE,
    });

    log('INFO', `Found ${candidates.length} backups to archive`);

    let successCount = 0;
    let failCount = 0;

    for (const backup of candidates) {
      try {
        await archiveBackup(backup.id, prisma);
        successCount++;
      } catch (err) {
        failCount++;
        log('ERROR', `Failed to archive backup ${backup.id}`, err instanceof Error ? err.message : err);
      }
    }

    // Calculate storage savings
    const hotStats = await prisma.backup.aggregate({
      _sum: { compressedBytes: true },
      _count: true,
      where: { storageLocation: 'database', deletedAt: null },
    });

    const coldStats = await prisma.backup.aggregate({
      _sum: { compressedBytes: true },
      _count: true,
      where: { storageLocation: 'filesystem', deletedAt: null },
    });

    const elapsed = Date.now() - cycleStart;
    log('INFO', `Archive cycle completed in ${elapsed}ms`, {
      archived: successCount,
      failed: failCount,
      hotTier: {
        count: hotStats._count,
        sizeMB: ((hotStats._sum.compressedBytes ?? 0) / 1024 / 1024).toFixed(2),
      },
      coldTier: {
        count: coldStats._count,
        sizeMB: ((coldStats._sum.compressedBytes ?? 0) / 1024 / 1024).toFixed(2),
      },
    });
  } catch (err) {
    log('ERROR', 'Archive cycle failed', err instanceof Error ? err.message : err);
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
log('INFO', `Backup Archive Worker starting with schedule: "${ARCHIVE_SCHEDULE}"`);

if (TIERED_ENABLED) {
  cron.schedule(ARCHIVE_SCHEDULE, () => {
    if (!isShuttingDown) {
      void runArchiveCycle();
    }
  });

  // Run immediately on startup
  void runArchiveCycle();
} else {
  log('WARN', 'Tiered storage is DISABLED. Set BACKUP_STORAGE_TIERED=true to enable.');
}

log('INFO', 'Backup Archive Worker is running. Press Ctrl+C to stop.');