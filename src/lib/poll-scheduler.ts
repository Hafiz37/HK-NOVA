import type { PrismaClient } from '@prisma/client';
import { getPollingIntervalMs, intervalToLabel, DEFAULT_POLL_INTERVAL_MS } from './polling-config';
import { withDistributedLock } from './distributed-lock';
import { logger } from './logger';

export interface PollSchedulerOptions {
  prisma: PrismaClient;
  runCycle: () => Promise<void>;
  log: (level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown) => void;
  isShuttingDown?: () => boolean;
  lockResource?: string;
}

export function startPollScheduler(
  { prisma, runCycle, log, isShuttingDown, lockResource }: PollSchedulerOptions
): () => void {
  let currentIntervalMs: number | null = null;
  let timer: NodeJS.Timeout | null = null;
  let inFlight = false;
  let stopped = false;

  const closed = (): boolean => stopped || (isShuttingDown?.() ?? false);

  const clearTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const arm = (intervalMs: number): void => {
    clearTimer();
    if (closed()) return;
    currentIntervalMs = intervalMs;
    timer = setTimeout(() => {
      void run();
    }, intervalMs);
  };

  const run = async (): Promise<void> => {
    if (closed() || inFlight) return;
    inFlight = true;
    try {
      if (lockResource) {
        const ttlMs = (currentIntervalMs ?? DEFAULT_POLL_INTERVAL_MS) * 2;
        await withDistributedLock(lockResource, runCycle, ttlMs);
      } else {
        await runCycle();
      }
    } catch (err) {
      log('ERROR', 'Scheduled poll cycle threw an unexpected error', err instanceof Error ? err.message : err);
      logger.error('Scheduled poll cycle error', { module: 'poll-scheduler', lockResource }, err);
    } finally {
      inFlight = false;
    }
    if (closed()) return;

    // Re-arm memakai interval terbaru. Gagal baca DB → pertahankan interval saat ini.
    const nextIntervalMs = await getPollingIntervalMs(prisma);
    const effectiveMs = nextIntervalMs ?? currentIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    if (currentIntervalMs !== null && nextIntervalMs !== null && nextIntervalMs !== currentIntervalMs) {
      log('INFO', `Polling interval updated to ${intervalToLabel(nextIntervalMs)}`);
    } else if (currentIntervalMs !== null && nextIntervalMs === null) {
      log('WARN', 'Failed to read polling interval from DB — keeping current interval');
    }
    arm(effectiveMs);
  };

  // Watcher: reaksi cepat terhadap perubahan interval (tiap 5 detik).
  // Tidak mengganggu siklus yang sedang berjalan (inFlight) — run() akan
  // memakai interval terbaru saat re-arm, jadi aman melewati perubahan.
  const watcher = setInterval(() => {
    if (closed()) return;
    void getPollingIntervalMs(prisma).then((ms) => {
      if (closed()) return;
      if (ms !== null && ms !== currentIntervalMs && !inFlight) {
        log('INFO', `Polling interval changed to ${intervalToLabel(ms)} — re-arming timer`);
        arm(ms);
      }
    });
  }, 5000);

  const stop = (): void => {
    stopped = true;
    clearTimer();
    clearInterval(watcher);
  };

  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  // Log interval aktif sebelum siklus pertama (kalau terbaca)
  void getPollingIntervalMs(prisma).then((ms) => {
    if (ms !== null) {
      log('INFO', `Polling scheduler started — interval ${intervalToLabel(ms)}`);
    }
  });

  // Jalankan segera pada startup
  void run();

  return stop;
}