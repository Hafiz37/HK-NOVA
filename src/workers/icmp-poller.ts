/**
 * ICMP Poller Worker
 * Standalone Node.js process for polling device reachability via ICMP ping.
 * Runs on node-cron schedule, uses queue-based batching with concurrency control.
 * Supports both raw socket (net-ping) and system ping fallback.
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import {
  ICMP_BATCH_SIZE,
  ICMP_POLL_INTERVAL,
  ICMP_PING_RETRIES,
  ICMP_ALERT_COOLDOWN_MS,
  DEFAULT_PING_TIMEOUT,
} from '../lib/constants';
import { sendTelegramNotification, formatAlertMessage } from '../lib/telegram';
import { randomUUID } from 'crypto';
import { isDeviceInMaintenance } from '../lib/maintenance';
import {
  processDeviceDownAlert,
  resolveDeviceDownAlert,
  createAlertIfNotDuplicate,
  dedupKeyUp,
  correlationKeyFor,
} from '../lib/alert-engine';

// ─── Prisma singleton for worker process ────────────────────────────────────
const prisma = new PrismaClient();

// ─── net-ping types (no @types package bundled) ──────────────────────────────
// net-ping has no types, using require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ping = require('net-ping') as {
  createSession: (opts: NetPingSessionOptions) => NetPingSession;
};

interface NetPingSessionOptions {
  timeout: number;
  retries: number;
  packetSize?: number;
  ttl?: number;
}

interface NetPingSession {
  pingHost(
    host: string,
    callback: (error: Error | null, target: string, sent: Date, rcvd: Date) => void
  ): void;
  close(): void;
}

// ─── System ping fallback (no root required) ─────────────────────────────────
async function pingHostSystem(ip: string, timeoutMs: number): Promise<{ latency: number; success: true } | { success: false; error: string }> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawn } = require('child_process');
    // ping -c 1 -W timeout_sec ip
    const timeoutSec = Math.ceil(timeoutMs / 1000);
    const child = spawn('ping', ['-c', '1', '-W', String(timeoutSec), ip]);
    const start = Date.now();
    let output = '';

    child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { output += data.toString(); });

    child.on('close', (code: number | null) => {
      const latency = Date.now() - start;
      if (code === 0) {
        // Parse latency from output: "time=1.23 ms"
        const match = output.match(/time[=<]([\d.]+)\s*ms/);
        const parsedLatency = match ? parseFloat(match[1]) : latency;
        resolve({ latency: parsedLatency, success: true });
      } else {
        resolve({ success: false, error: `ping exit code ${code}` });
      }
    });

    child.on('error', (err: Error) => {
      resolve({ success: false, error: err.message });
    });

    // Safety timeout
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ success: false, error: 'ping command timeout' });
    }, timeoutMs + 1000);
  });
}

// ─── In-memory cooldown tracker ──────────────────────────────────────────────
/** Map<deviceId, lastNotifiedTimestamp> */
const notificationCooldown = new Map<string, number>();

// ─── Types ───────────────────────────────────────────────────────────────────
interface PingResult {
  deviceId: string;
  ip: string;
  latency: number | null;
  packetLoss: number; // 0-100
  success: boolean;
  error?: string;
}

// ─── Logging helper ──────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [ICMP-WORKER] [${level}] ${message}${metaStr}`);
}

// ─── Ping a single host with exponential backoff retries ─────────────────────
async function pingHost(session: NetPingSession | null, ip: string): Promise<{ latency: number; success: true } | { success: false; error: string }> {
  // Try net-ping first (raw sockets)
  if (session) {
    let attempt = 0;
    while (attempt <= ICMP_PING_RETRIES) {
      const result = await new Promise<{ latency: number; success: true } | { success: false; error: string }>((resolve) => {
        const sent = Date.now();
        session!.pingHost(ip, (err, _target, _sent, rcvd) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            const latency = rcvd.getTime() - sent;
            resolve({ latency, success: true });
          }
        });
      });

      if (result.success) return result;

      // If permission error, fall back to system ping immediately
      if (result.error.includes('Operation not permitted') || result.error.includes('EPERM') || result.error.includes('EACCES')) {
        log('WARN', `net-ping permission error for ${ip}, falling back to system ping`);
        break;
      }

      attempt++;
      if (attempt <= ICMP_PING_RETRIES) {
        const delay = 500 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // Fallback: system ping command (no root required)
  log('INFO', `Using system ping fallback for ${ip}`);
  for (let attempt = 0; attempt <= ICMP_PING_RETRIES; attempt++) {
    const result = await pingHostSystem(ip, DEFAULT_PING_TIMEOUT);
    if (result.success) return result;
    if (attempt < ICMP_PING_RETRIES) {
      const delay = 500 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return { success: false, error: 'Ping timed out after retries (net-ping + system ping)' };
}

// ─── Poll a single device ─────────────────────────────────────────────────────
async function pollDevice(
  session: NetPingSession | null,
  device: { id: string; ip: string; name: string }
): Promise<PingResult> {
  try {
    const result = await pingHost(session, device.ip);
    if (result.success) {
      return {
        deviceId: device.id,
        ip: device.ip,
        latency: result.latency,
        packetLoss: 0,
        success: true,
      };
    } else {
      return {
        deviceId: device.id,
        ip: device.ip,
        latency: null,
        packetLoss: 100,
        success: false,
        error: result.error,
      };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      deviceId: device.id,
      ip: device.ip,
      latency: null,
      packetLoss: 100,
      success: false,
      error: errMsg,
    };
  }
}

// ─── Process alert transitions ────────────────────────────────────────────────
async function handleAlertTransition(
  device: { id: string; name: string; ip: string; status: string },
  newStatus: 'UP' | 'DOWN' | 'UNKNOWN'
): Promise<void> {
  const previousStatus = device.status;

  // Suppress alerts while device is under maintenance window
  if (await isDeviceInMaintenance(device.id)) {
    log('INFO', `[MAINTENANCE] Alerts suppressed for ${device.name} (${device.ip})`);
    return;
  }

  // UP → DOWN: create DEVICE_DOWN alert (dedupe + korelasi)
  if (previousStatus !== 'DOWN' && newStatus === 'DOWN') {
    const baseMessage = `Device ${device.name} (${device.ip}) is unreachable. ICMP ping failed after ${ICMP_PING_RETRIES + 1} attempts.`;

    const result = await processDeviceDownAlert(prisma, device, baseMessage);

    if (result.created) {
      log('WARN', `Alert DEVICE_DOWN created for ${device.name} (${device.ip}) severity=${result.alert.severity}`);

      await sendNotificationWithCooldown(device.id, device.name, 'DEVICE_DOWN', result.alert.severity,
        `${device.name} (${device.ip}) tidak dapat dijangkau. Semua percobaan ping gagal.`);
    } else {
      log('INFO', `Alert DEVICE_DOWN sudah aktif (dedupe) untuk ${device.name} (${device.ip})`);
    }
  }

  // DOWN → UP: create DEVICE_UP alert, auto-resolve previous DEVICE_DOWN + children
  if (previousStatus === 'DOWN' && newStatus === 'UP') {
    const { downResolved, childrenResolved } = await resolveDeviceDownAlert(prisma, device.id);

    await createAlertIfNotDuplicate(prisma, {
      type: 'DEVICE_UP',
      deviceId: device.id,
      message: `Device ${device.name} (${device.ip}) has recovered and is now reachable.`,
      severity: 'MEDIUM',
      status: 'RESOLVED',
      resolvedAt: new Date(),
      dedupKey: dedupKeyUp(device.id),
      correlationKey: correlationKeyFor(device.id),
    });

    log('INFO', `Device recovered: ${device.name} (${device.ip}) (${downResolved} DEVICE_DOWN resolved, ${childrenResolved} children resolved)`);

    await sendNotificationWithCooldown(device.id, device.name, 'DEVICE_UP', 'MEDIUM',
      `${device.name} (${device.ip}) kembali online dan dapat dijangkau.`);
  }
}

async function sendNotificationWithCooldown(
  deviceId: string,
  deviceName: string,
  type: string,
  severity: string,
  message: string
): Promise<void> {
  const lastNotified = notificationCooldown.get(deviceId) ?? 0;
  const now = Date.now();

  if (now - lastNotified < ICMP_ALERT_COOLDOWN_MS) {
    log('INFO', `Notification cooldown active for ${deviceName}, skipping Telegram message`);
    return;
  }

  notificationCooldown.set(deviceId, now);
  const formatted = formatAlertMessage(type, severity, deviceName, message);
  await sendTelegramNotification(formatted);
}

// ─── Process results and persist to DB ──────────────────────────────────────
async function persistResults(
  results: PingResult[],
  deviceMap: Map<string, { id: string; name: string; ip: string; status: string }>
): Promise<void> {
  const settledResults = await Promise.allSettled(
    results.map(async (result) => {
      const device = deviceMap.get(result.deviceId);
      if (!device) return;

      const newStatus: 'UP' | 'DOWN' | 'UNKNOWN' = result.success ? 'UP' : 'DOWN';

      // Save metric record
      await prisma.metric.create({
        data: {
          deviceId: result.deviceId,
          metricType: 'ICMP',
          latency: result.latency,
          packetLoss: result.packetLoss,
        },
      });

      // Handle alert transitions BEFORE updating status
      await handleAlertTransition(device, newStatus);

      // Update device status
      await prisma.device.update({
        where: { id: result.deviceId },
        data: { status: newStatus },
      });
    })
  );

  // Log any persistence errors
  settledResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      log('ERROR', `Failed to persist result for device index ${i}`, r.reason);
    }
  });
}

// ─── Process a batch of devices ──────────────────────────────────────────────
async function processBatch(
  devices: Array<{ id: string; name: string; ip: string; status: string }>,
  deviceMap: Map<string, { id: string; name: string; ip: string; status: string }>
): Promise<void> {
  let session: NetPingSession | null = null;

  try {
    try {
      session = ping.createSession({
        timeout: DEFAULT_PING_TIMEOUT,
        retries: 0, // We handle retries manually with backoff
        packetSize: 64,
      });
    } catch (sessionErr) {
      log('WARN', `Failed to create net-ping session, using system ping fallback: ${sessionErr instanceof Error ? sessionErr.message : sessionErr}`);
      session = null;
    }

    const settled = await Promise.allSettled(
      devices.map((device) => pollDevice(session, device))
    );

    const results: PingResult[] = settled
      .map((s, i) => {
        if (s.status === 'fulfilled') return s.value;
        // If the promise itself rejected (unexpected), return a failed result
        return {
          deviceId: devices[i].id,
          ip: devices[i].ip,
          latency: null,
          packetLoss: 100,
          success: false,
          error: String(s.reason),
        } satisfies PingResult;
      });

    await persistResults(results, deviceMap);

    const upCount = results.filter((r) => r.success).length;
    const downCount = results.filter((r) => !r.success).length;
    log('INFO', `Batch complete: ${upCount} UP, ${downCount} DOWN out of ${results.length} devices`);
  } finally {
    if (session) {
      try {
        session.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

// ─── Overlap guard ────────────────────────────────────────────────────────────
let currentCycleId: string | null = null;

// ─── Main polling cycle ───────────────────────────────────────────────────────
async function runPollCycle(): Promise<void> {
  // Overlap guard: skip if previous cycle still running
  if (currentCycleId) {
    log('WARN', `Skipping poll cycle — previous cycle [${currentCycleId}] still running`);
    return;
  }

  const cycleStart = Date.now();
  const cycleId = randomUUID();
  currentCycleId = cycleId;
  log('INFO', `Starting ICMP poll cycle [${cycleId}]`);

  try {
    // Fetch all active REAL devices (exclude MAINTENANCE and demo devices)
    // Demo devices are handled by demo-generator worker
    const devices = await prisma.device.findMany({
      where: {
        status: { not: 'MAINTENANCE' },
        deletedAt: null,
        isDemo: false,
      },
      select: { id: true, name: true, ip: true, status: true, isDemo: true },
    });

    // Also fetch demo device count for logging
    const demoCount = await prisma.device.count({
      where: { status: { not: 'MAINTENANCE' }, deletedAt: null, isDemo: true },
    });

    if (devices.length === 0 && demoCount === 0) {
      log('INFO', 'No active devices to poll');
      currentCycleId = null;
      return;
    }

    // Build lookup map for status transition logic
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    log('INFO', `Polling ${devices.length} REAL devices (+ ${demoCount} demo devices handled by demo-generator) in batches of ${ICMP_BATCH_SIZE}`);

    // Process in batches
    for (let i = 0; i < devices.length; i += ICMP_BATCH_SIZE) {
      const batch = devices.slice(i, i + ICMP_BATCH_SIZE);
      const batchNum = Math.floor(i / ICMP_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(devices.length / ICMP_BATCH_SIZE);
      log('INFO', `Processing batch ${batchNum}/${totalBatches} (${batch.length} devices)`);
      await processBatch(batch, deviceMap);
    }

    const elapsed = Date.now() - cycleStart;
    log('INFO', `Poll cycle [${cycleId}] completed in ${elapsed}ms`);
  } catch (err) {
    log('ERROR', 'Poll cycle failed', err instanceof Error ? err.message : err);
  } finally {
    currentCycleId = null;
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
log('INFO', `ICMP Poller starting with schedule: "${ICMP_POLL_INTERVAL}", batch size: ${ICMP_BATCH_SIZE}`);

// Run once immediately on startup
void runPollCycle();

// Schedule recurring runs
cron.schedule(ICMP_POLL_INTERVAL, () => {
  if (!isShuttingDown) {
    void runPollCycle();
  }
});

log('INFO', 'ICMP Poller worker is running. Press Ctrl+C to stop.');
