import type { PrismaClient } from '@prisma/client';
import { getPollingIntervalMs, intervalToLabel, DEFAULT_POLL_INTERVAL_MS } from './polling-config';

/**
 * Self-rescheduling poll scheduler.
 *
 * - Membaca interval dari DB (setting) setelah tiap siklus, sehingga perubahan
 *   interval diterapkan pada siklus berikutnya.
 * - Watcher ringan cek DB tiap 5 detik; jika interval berubah, timer yang
 *   tertunda di-re-arm segera (tanpa restart worker).
 * - Serial execution: runCycle tidak pernah dijalankan bersamaan. Siklus lambat
 *   hanya menunda run berikutnya (seperti perilaku node-cron lama).
 * - Gangguan DB sesaat TIDAK mengubah interval: interval saat ini dipertahankan
 *   sampai pembacaan berikutnya berhasil.
 */
export interface PollSchedulerOptions {
  prisma: PrismaClient;
  runCycle: () => Promise<void>;
  log: (level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown) => void;
  isShuttingDown?: () => boolean;
}

export function startPollScheduler(
  { prisma, runCycle, log, isShuttingDown }: PollSchedulerOptions
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
      await runCycle();
    } catch (err) {
      log('ERROR', 'Scheduled poll cycle threw an unexpected error', err instanceof Error ? err.message : err);
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