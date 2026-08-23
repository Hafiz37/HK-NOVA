/**
 * Config Backup Worker
 * Periodically fetches device running-configurations over SSH and stores a new
 * Backup snapshot only when the configuration changed (sha256 comparison).
 * Features: per-device scheduling, subnet-based concurrency, latency-aware skipping
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
const BACKUP_MAX_PER_SUBNET = Number(process.env.BACKUP_MAX_PER_SUBNET ?? '2');
const BACKUP_SKIP_HIGH_LATENCY = process.env.BACKUP_SKIP_HIGH_LATENCY === 'true';
const BACKUP_LATENCY_THRESHOLD_MS = Number(process.env.BACKUP_LATENCY_THRESHOLD_MS ?? '500');
const BACKUP_ALLOWED_HOURS = process.env.BACKUP_ALLOWED_HOURS ?? '02:00-05:00'; // off-peak window

// ─── Logging helper ──────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [BACKUP-WORKER] [${level}] ${message}${metaStr}`);
}

function getSubnet(ip: string): string {
  // Simple /24 subnet: 192.168.1.x -> 192.168.1
  return ip.split('.').slice(0, 3).join('.');
}

function isWithinAllowedHours(): boolean {
  if (!BACKUP_ALLOWED_HOURS) return true;
  const now = new Date();
  const currentHour = now.getHours();
  const [start, end] = BACKUP_ALLOWED_HOURS.split('-').map(h => parseInt(h.split(':')[0], 10));
  return currentHour >= start && currentHour < end;
}

async function runBackupCycle(): Promise<void> {
  const cycleStart = Date.now();
  log('INFO', `Starting backup cycle (concurrency: ${BACKUP_CONCURRENCY}, maxPerSubnet: ${BACKUP_MAX_PER_SUBNET})`);

  // Check if within allowed hours
  if (!isWithinAllowedHours()) {
    log('INFO', `Outside allowed hours (${BACKUP_ALLOWED_HOURS}), skipping cycle`);
    return;
  }

  // Load devices with custom schedules
  const devices = await prisma.device.findMany({
    where: {
      deletedAt: null,
      isDemo: false,
      backupEnabled: true,
    },
    include: { credentials: true },
    orderBy: { backupPriority: 'desc' }, // High priority first
  });

  // Filter devices by schedule (if custom schedule set)
  const now = new Date();
  const currentHour = now.getHours();

  const candidates = devices
    .filter((d) => resolveSshCredentials(d.credentials) !== null)
    .filter((d) => {
      if (!d.backupSchedule) return true; // Use global schedule
      // Simple cron hour check (for full cron parsing, use a library)
      const scheduleHour = parseInt(d.backupSchedule.split(' ')[1] || '2', 10);
      if (isNaN(scheduleHour)) return true;
      return currentHour === scheduleHour;
    });

  log('INFO', `${devices.length} devices total, ${candidates.length} scheduled for this cycle`);

  let succeeded = 0;
  let changed = 0;
  let failed = 0;
  let skipped = 0;

  const subnetTracker: Record<string, number> = {};

  for (let i = 0; i < candidates.length; i += BACKUP_CONCURRENCY) {
    const batch = candidates.slice(i, i + BACKUP_CONCURRENCY);

    // Apply subnet limit
    const batchFiltered = batch.filter((device) => {
      const subnet = getSubnet(device.ip);
      const current = subnetTracker[subnet] || 0;

      if (current >= BACKUP_MAX_PER_SUBNET) {
        skipped++;
        log('WARN', `Skipping ${device.name} (subnet ${subnet} limit reached: ${BACKUP_MAX_PER_SUBNET})`);
        return false;
      }

      subnetTracker[subnet] = current + 1;
      return true;
    });

    // Optional: Check latency before backup
    if (BACKUP_SKIP_HIGH_LATENCY) {
      for (const device of batchFiltered) {
        const recentMetric = await prisma.metric.findFirst({
          where: {
            deviceId: device.id,
            metricType: 'icmp',
            timestamp: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // last 5min
          },
          orderBy: { timestamp: 'desc' },
        });

        if (recentMetric && recentMetric.latency && recentMetric.latency > BACKUP_LATENCY_THRESHOLD_MS) {
          skipped++;
          const subnet = getSubnet(device.ip);
          subnetTracker[subnet] = Math.max(0, (subnetTracker[subnet] || 0) - 1);
          log('WARN', `Skipping ${device.name} (high latency: ${recentMetric.latency}ms > ${BACKUP_LATENCY_THRESHOLD_MS}ms)`);
        }
      }
    }

    const results = await Promise.allSettled(
      batchFiltered.map((device) => performBackup(prisma, device))
    );

    results.forEach((r, idx) => {
      const device = batchFiltered[idx];
      const subnet = getSubnet(device.ip);
      subnetTracker[subnet] = Math.max(0, (subnetTracker[subnet] || 0) - 1);

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
    `Backup cycle selesai dalam ${elapsed}ms — success: ${succeeded}, changed: ${changed}, failed: ${failed}, skipped: ${skipped}`
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
log('INFO', `Config: concurrency=${BACKUP_CONCURRENCY}, maxPerSubnet=${BACKUP_MAX_PER_SUBNET}, skipHighLatency=${BACKUP_SKIP_HIGH_LATENCY}, allowedHours=${BACKUP_ALLOWED_HOURS}`);

if (BACKUP_RUN_ON_STARTUP) {
  void safeRunCycle();
}

cron.schedule(BACKUP_CRON_SCHEDULE, () => {
  if (!isShuttingDown) {
    void safeRunCycle();
  }
});

log('INFO', 'Backup Worker is running. Press Ctrl+C to stop.');