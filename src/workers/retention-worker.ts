/**
 * Retention Worker
 * Periodically cleans up old metric data based on METRICS_RETENTION_DAYS.
 * Runs on a daily cron schedule with batch deletion to avoid long transactions.
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { METRICS_RETENTION_DAYS } from '../lib/constants';

// ─── Prisma singleton for worker process ────────────────────────────────────
const prisma = new PrismaClient();

// ─── Configuration ──────────────────────────────────────────────────────────
const RETENTION_BATCH_SIZE = Number(process.env.RETENTION_BATCH_SIZE ?? '1000');
const RETENTION_CRON_SCHEDULE = process.env.RETENTION_CRON_SCHEDULE ?? '0 3 * * *'; // Daily at 3 AM
const RETENTION_DRY_RUN = process.env.RETENTION_DRY_RUN === 'true';

// ─── Logging helper ──────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [RETENTION-WORKER] [${level}] ${message}${metaStr}`);
}

// ─── Delete metrics older than retention period ──────────────────────────────
async function cleanupOldMetrics(): Promise<{ deletedCount: number }> {
  const cutoffDate = new Date(Date.now() - METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;

  log('INFO', `Starting metrics retention cleanup. Cutoff date: ${cutoffDate.toISOString()}, batch size: ${RETENTION_BATCH_SIZE}, dryRun: ${RETENTION_DRY_RUN}`);

  while (true) {
    // Find a batch of old metric IDs to delete
    const metricsToDelete = await prisma.metric.findMany({
      where: {
        timestamp: { lt: cutoffDate },
      },
      select: { id: true },
      take: RETENTION_BATCH_SIZE,
      orderBy: { timestamp: 'asc' },
    });

    if (metricsToDelete.length === 0) {
      log('INFO', 'No more old metrics to delete');
      break;
    }

    const ids = metricsToDelete.map((m) => m.id);

    if (RETENTION_DRY_RUN) {
      log('INFO', `[DRY RUN] Would delete ${ids.length} metrics (IDs: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '...' : ''})`);
      totalDeleted += ids.length;
    } else {
      const result = await prisma.metric.deleteMany({
        where: { id: { in: ids } },
      });
      log('INFO', `Deleted ${result.count} metrics in this batch`);
      totalDeleted += result.count;
    }

    // If we got fewer than batch size, we're done
    if (metricsToDelete.length < RETENTION_BATCH_SIZE) {
      break;
    }

    // Small delay to avoid overwhelming the database
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { deletedCount: totalDeleted };
}

// ─── Main cleanup cycle ──────────────────────────────────────────────────────
let cleaningInProgress = false;

async function runCleanupCycle(): Promise<void> {
  if (cleaningInProgress) {
    log('INFO', 'Retention cleanup already in progress — skipping scheduled run');
    return;
  }
  cleaningInProgress = true;
  const cycleStart = Date.now();
  log('INFO', 'Starting retention cleanup cycle');

  try {
    const { deletedCount } = await cleanupOldMetrics();
    const elapsed = Date.now() - cycleStart;
    log('INFO', `Retention cleanup cycle completed in ${elapsed}ms. Total deleted: ${deletedCount} metrics. Retention period: ${METRICS_RETENTION_DAYS} days`);
  } catch (err) {
    log('ERROR', 'Retention cleanup cycle failed', err instanceof Error ? err.message : err);
  } finally {
    cleaningInProgress = false;
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('INFO', `Received ${signal}, shutting down gracefully...`);

  try {
    await prisma.$disconnect();
    log('INFO', 'Prisma disconnected');
  } catch (err) {
    log('ERROR', 'Error during shutdown', err);
  }

  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// ─── Startup ──────────────────────────────────────────────────────────────────
log('INFO', `Retention Worker starting with schedule: "${RETENTION_CRON_SCHEDULE}", batch size: ${RETENTION_BATCH_SIZE}, retention days: ${METRICS_RETENTION_DAYS}, dryRun: ${RETENTION_DRY_RUN}`);

// Run once immediately on startup (useful for initial cleanup)
void runCleanupCycle();

// Schedule recurring runs
cron.schedule(RETENTION_CRON_SCHEDULE, () => {
  if (!isShuttingDown) {
    void runCleanupCycle();
  }
});

log('INFO', 'Retention Worker is running. Press Ctrl+C to stop.');