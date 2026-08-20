/**
 * Delivery Retry Worker
 *
 * Menangani pengiriman notifikasi yang tercatat FAILED di `AlertDelivery`
 * namun belum melebihi batas percobaan. Memakai `nextRetryAt` untuk backoff.
 * Interval: tiap 2 menit (env RETRY_INTERVAL).
 */

import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import { resendDelivery } from '../lib/notifier';

const prisma = new PrismaClient();
const RETRY_INTERVAL = process.env.RETRY_INTERVAL ?? '*/2 * * * *';
const BATCH_LIMIT = 50;

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [RETRY] [${level}] ${message}${metaStr}`);
}

async function processRetries(): Promise<void> {
  try {
    const due = await prisma.alertDelivery.findMany({
      where: {
        status: 'FAILED',
        attempts: { lt: 5 },
        nextRetryAt: { lte: new Date() },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: BATCH_LIMIT,
      select: { id: true, channel: true },
    });

    if (due.length === 0) return;

    let ok = 0;
    let failed = 0;
    for (const d of due) {
      try {
        const res = await resendDelivery(prisma, d.id);
        if (res.ok) ok += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        log('ERROR', `Gagal memproses retry ${d.id}`, err instanceof Error ? err.message : err);
      }
    }
    log('INFO', `Batch retry selesai: ${ok} terkirim, ${failed} masih gagal (dari ${due.length})`);
  } catch (err) {
    log('ERROR', 'Siklus retry gagal', err instanceof Error ? err.message : err);
  }
}

let isRunning = false;
async function scheduled(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    await processRetries();
  } finally {
    isRunning = false;
  }
}

let isShuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('INFO', `Received ${signal}, shutting down...`);
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

cron.schedule(RETRY_INTERVAL, () => void scheduled());
log('INFO', `Delivery retry worker running (cron: ${RETRY_INTERVAL})`);
void scheduled();