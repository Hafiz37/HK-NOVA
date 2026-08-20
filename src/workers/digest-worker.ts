/**
 * Digest Worker
 *
 * Menyiram buffer digest (kebijakan `alert:policies` → digestEnabled) menjadi
 * SATU notifikasi ringkasan tiap `digestWindowMinutes`, melalui channel yang
 * aktif (menghormati severity-gate & quiet hours & cooldown).
 */

import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import { getAlertPolicy } from '../lib/alert-policy';
import { readDigestBuffer, clearDigestBuffer, buildDigestSummary } from '../lib/digest';
import { dispatchNotifications } from '../lib/notifier';

const prisma = new PrismaClient();
const DIGEST_INTERVAL = process.env.DIGEST_INTERVAL ?? '* * * * *';

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [DIGEST] [${level}] ${message}${metaStr}`);
}

async function maybeFlush(): Promise<void> {
  try {
    const policy = await getAlertPolicy(prisma);
    const buffer = await readDigestBuffer(prisma);
    if (buffer.items.length === 0) return;
    if (!policy.digestEnabled) {
      log('INFO', 'Digest dinonaktifkan — buffer dipertahankan (belum dikirim)');
      return;
    }

    const updated = buffer.updatedAt ? new Date(buffer.updatedAt).getTime() : 0;
    const windowMs = Math.max(1, policy.digestWindowMinutes) * 60_000;
    if (Date.now() - updated < windowMs) return;

    const summary = buildDigestSummary(buffer);
    const result = await dispatchNotifications(
      prisma,
      {
        type: 'DIGEST_SUMMARY',
        severity: 'MEDIUM',
        deviceId: 'digest',
        deviceName: 'HK-NOVA Digest',
        message: summary,
        cooldownKey: 'digest',
        cooldownMs: 5 * 60 * 1000,
        timestamp: new Date(),
      },
      { skipDigest: true }
    );

    await clearDigestBuffer(prisma);
    log('INFO', `Digest dikirim: ${buffer.items.length} event via [${result.sent.join(', ') || 'none'}]`);
  } catch (err) {
    log('ERROR', 'Gagal menyiram digest', err instanceof Error ? err.message : err);
  }
}

let isRunning = false;
async function scheduled(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    await maybeFlush();
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

cron.schedule(DIGEST_INTERVAL, () => void scheduled());
log('INFO', `Digest worker running (cron: ${DIGEST_INTERVAL})`);
void scheduled();