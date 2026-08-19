/**
 * Config Backup Worker
 * Periodically fetches device running-configurations over SSH and stores a new
 * Backup snapshot only when the configuration changed (sha256 comparison).
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { performBackup } from '../lib/backup';
import { resolveSshCredentials } from '../lib/device-console';

// ─── Prisma singleton for worker process ────────────────────────────────────
const prisma = new PrismaClient();

// ─── Configuration ──────────────────────────────────────────────────────────
const BACKUP_CRON_SCHEDULE = process.env.BACKUP_CRON_SCHEDULE ?? '0 2 * * *'; // daily at 02:00
const BACKUP_RUN_ON_STARTUP = process.env.BACKUP_RUN_ON_STARTUP !== 'false';
const BACKUP_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.BACKUP_CONCURRENCY ?? '4')));

// ─── Logging helper ──────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [BACKUP-WORKER] [${level}] ${message}${metaStr}`);
}

async function runBackupCycle(): Promise<void> {
  const cycleStart = Date.now();
  log('INFO', `Starting backup cycle (concurrency: ${BACKUP_CONCURRENCY})`);

  const devices = await prisma.device.findMany({
    where: { deletedAt: null, isDemo: false },
    include: { credentials: true },
  });

  const candidates = devices.filter(
    (d) => resolveSshCredentials(d.credentials) !== null
  );

  log('INFO', `${devices.length} device terpilih, ${candidates.length} punya kredensial SSH`);

  let succeeded = 0;
  let changed = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i += BACKUP_CONCURRENCY) {
    const batch = candidates.slice(i, i + BACKUP_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((device) => performBackup(prisma, device))
    );

    results.forEach((r, idx) => {
      const device = batch[idx];
      if (r.status === 'rejected') {
        failed += 1;
        log('ERROR', `Backup gagal untuk ${device.name}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
        return;
      }
      const res = r.value;
      if (res.status === 'FAILED') {
        failed += 1;
        log('WARN', `Backup FAILED untuk ${device.name}: ${res.errorMessage ?? 'unknown error'}`);
      } else {
        succeeded += 1;
        if (res.changed) {
          changed += 1;
          log('INFO', `Konfigurasi berubah — snapshot baru disimpan untuk ${device.name}`);
        } else {
          log('INFO', `Tidak ada perubahan konfigurasi untuk ${device.name}`);
        }
      }
    });
  }

  const elapsed = Date.now() - cycleStart;
  log(
    'INFO',
    `Backup cycle selesai dalam ${elapsed}ms — success: ${succeeded}, changed: ${changed}, failed: ${failed}`
  );
}

// ─── Overlap guard ────────────────────────────────────────────────────────────
let cycleInProgress = false;

async function safeRunCycle(): Promise<void> {
  if (cycleInProgress) {
    log('INFO', 'Backup cycle masih berjalan — skip jadwal ini');
    return;
  }
  cycleInProgress = true;
  try {
    await runBackupCycle();
  } catch (err) {
    log('ERROR', 'Backup cycle gagal', err instanceof Error ? err.message : err);
  } finally {
    cycleInProgress = false;
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
log('INFO', `Backup Worker starting with schedule: "${BACKUP_CRON_SCHEDULE}", runOnStartup: ${BACKUP_RUN_ON_STARTUP}`);

if (BACKUP_RUN_ON_STARTUP) {
  void safeRunCycle();
}

cron.schedule(BACKUP_CRON_SCHEDULE, () => {
  if (!isShuttingDown) {
    void safeRunCycle();
  }
});

log('INFO', 'Backup Worker is running. Press Ctrl+C to stop.');