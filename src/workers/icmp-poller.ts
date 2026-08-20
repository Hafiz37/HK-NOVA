/**
 * ICMP Poller Worker — v3 (Accuracy & Feature Enhancement)
 *
 * Optimasi (v2):
 *  - Batch polling    : 20–50 device per batch (ICMP_BATCH_SIZE, default 20)
 *  - Parallel polling : pLimit() maks ICMP_CONCURRENCY_LIMIT concurrent
 *  - Redis queue      : enqueue → dequeue per batch; fallback in-memory
 *
 * Fitur baru (v3):
 *  - ICMPv6 support   : deteksi IPv6 address, gunakan 'ping6' command
 *  - Jitter & RTT     : multi-probe ping (3×), hitung jitter/rttMin/rttMax
 *  - Dynamic threshold: threshold latency/jitter berbasis historis per device
 */

import { PrismaClient } from '@prisma/client';
import {
  ICMP_BATCH_SIZE,
  ICMP_CONCURRENCY_LIMIT,
  ICMP_PING_RETRIES,
  ICMP_ALERT_COOLDOWN_MS,
  DEFAULT_PING_TIMEOUT,
  REDIS_QUEUE_TTL_SECONDS,
} from '../lib/constants';
import { startPollScheduler } from '../lib/poll-scheduler';
import { dispatchNotifications } from '../lib/notifier';
import { randomUUID } from 'crypto';
import { isDeviceInMaintenance } from '../lib/maintenance';
import {
  processDeviceDownAlert,
  resolveDeviceDownAlert,
  createAlertIfNotDuplicate,
  dedupKeyUp,
  correlationKeyFor,
} from '../lib/alert-engine';
import {
  enqueueDevices,
  dequeueDevices,
  getQueueStatus,
  closeRedis,
  pLimit,
} from '../lib/redis-queue';
import { computeAndSaveDynamicThreshold } from '../lib/dynamic-threshold';
import { forwardMetricsToSiem } from '../lib/siem-forward';

// ─── Prisma singleton ────────────────────────────────────────────────────────
const prisma = new PrismaClient();

// ─── net-ping (no @types) ────────────────────────────────────────────────────
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

// ─── Types ───────────────────────────────────────────────────────────────────
interface PingResult {
  deviceId: string;
  ip: string;
  latency: number | null;    // median RTT (ms)
  rttMin: number | null;     // minimum RTT dari multi-probe
  rttMax: number | null;     // maximum RTT dari multi-probe
  jitter: number | null;     // variasi RTT (stddev antar probe, ms)
  packetLoss: number;        // 0–100
  isIPv6: boolean;
  success: boolean;
  error?: string;
}

type DeviceRecord = { id: string; name: string; ip: string; status: string; isDemo?: boolean };

// ─── Logging helper ──────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [ICMP-WORKER] [${level}] ${message}${metaStr}`);
}

// ─── IPv6 detection ───────────────────────────────────────────────────────────
function isIPv6Address(ip: string): boolean {
  // Simplified: IPv6 contains ':'
  return ip.includes(':');
}

// ─── System ping (IPv4 & IPv6) — dengan multi-probe untuk jitter ────────────
async function pingSystemMultiProbe(
  ip: string,
  timeoutMs: number,
  probes: number = 3
): Promise<
  | { success: true; latencies: number[]; avgLatency: number; jitter: number; rttMin: number; rttMax: number }
  | { success: false; error: string }
> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawn } = require('child_process');
    const timeoutSec = Math.ceil(timeoutMs / 1000);
    const ipv6 = isIPv6Address(ip);
    // ping6 untuk IPv6; ping -6 pada beberapa distro
    const cmd = ipv6 ? 'ping6' : 'ping';
    const args = ipv6
      ? ['-c', String(probes), '-W', String(timeoutSec), ip]
      : ['-c', String(probes), '-W', String(timeoutSec), ip];

    const child = spawn(cmd, args);
    let output = '';

    child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { output += data.toString(); });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        // Parse semua RTT dari output: "time=1.23 ms" atau "time=1.23ms"
        const rtts: number[] = [];
        const rttRe = /time[=<](\d+\.?\d*)\s*ms/g;
        let m: RegExpExecArray | null;
        while ((m = rttRe.exec(output)) !== null) {
          rtts.push(parseFloat(m[1]));
        }
        if (rtts.length > 0) {
          const avg = rtts.reduce((s, v) => s + v, 0) / rtts.length;
          const rttMin = Math.min(...rtts);
          const rttMax = Math.max(...rtts);
          // Jitter = stddev RTT antar probe
          const variance = rtts.reduce((s, v) => s + (v - avg) ** 2, 0) / rtts.length;
          const jitter = Math.sqrt(variance);
          resolve({ success: true, latencies: rtts, avgLatency: avg, jitter, rttMin, rttMax });
        } else {
          // Tidak bisa parse tapi exit 0 — anggap berhasil dengan latency kasar
          resolve({ success: false, error: 'ping succeeded but could not parse RTT' });
        }
      } else {
        resolve({ success: false, error: `ping exit code ${code}` });
      }
    });

    child.on('error', (err: Error) => {
      // Jika ping6 tidak ditemukan, fallback ke ping -6
      if (ipv6 && err.message.includes('ENOENT')) {
        const child2 = spawn('ping', ['-6', '-c', String(probes), '-W', String(timeoutSec), ip]);
        let out2 = '';
        child2.stdout.on('data', (d: Buffer) => { out2 += d.toString(); });
        child2.stderr.on('data', (d: Buffer) => { out2 += d.toString(); });
        child2.on('close', (code2: number | null) => {
          if (code2 === 0) {
            const rtts2: number[] = [];
            const re2 = /time[=<](\d+\.?\d*)\s*ms/g;
            let m2: RegExpExecArray | null;
            while ((m2 = re2.exec(out2)) !== null) rtts2.push(parseFloat(m2[1]));
            if (rtts2.length > 0) {
              const avg2 = rtts2.reduce((s, v) => s + v, 0) / rtts2.length;
              const jitter2 = Math.sqrt(rtts2.reduce((s, v) => s + (v - avg2) ** 2, 0) / rtts2.length);
              resolve({ success: true, latencies: rtts2, avgLatency: avg2, jitter: jitter2, rttMin: Math.min(...rtts2), rttMax: Math.max(...rtts2) });
            } else {
              resolve({ success: false, error: 'ping -6 succeeded but no RTT parsed' });
            }
          } else {
            resolve({ success: false, error: `ping -6 exit code ${code2}` });
          }
        });
        child2.on('error', (err2: Error) => resolve({ success: false, error: err2.message }));
      } else {
        resolve({ success: false, error: err.message });
      }
    });

    setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ success: false, error: 'ping command timeout' });
    }, timeoutMs * probes + 2000);
  });
}

// Adapter backward-compatible untuk net-ping fallback (single probe)
async function pingHostSystem(
  ip: string,
  timeoutMs: number
): Promise<{ latency: number; success: true } | { success: false; error: string }> {
  const r = await pingSystemMultiProbe(ip, timeoutMs, 1);
  if (r.success) return { latency: r.avgLatency, success: true };
  return { success: false, error: r.error };
}

// ─── Ping host (net-ping → system ping fallback) ──────────────────────────────
async function pingHost(
  session: NetPingSession | null,
  ip: string
): Promise<{ latency: number; success: true } | { success: false; error: string }> {
  if (session) {
    let attempt = 0;
    while (attempt <= ICMP_PING_RETRIES) {
      const result = await new Promise<{ latency: number; success: true } | { success: false; error: string }>((resolve) => {
        const sent = Date.now();
        session!.pingHost(ip, (err, _target, _sent, rcvd) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ latency: rcvd.getTime() - sent, success: true });
          }
        });
      });

      if (result.success) return result;

      if (result.error.includes('Operation not permitted') || result.error.includes('EPERM') || result.error.includes('EACCES')) {
        log('WARN', `net-ping permission error for ${ip}, falling back to system ping`);
        break;
      }

      attempt++;
      if (attempt <= ICMP_PING_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      }
    }
  }

  log('INFO', `Using system ping fallback for ${ip}`);
  for (let attempt = 0; attempt <= ICMP_PING_RETRIES; attempt++) {
    const result = await pingHostSystem(ip, DEFAULT_PING_TIMEOUT);
    if (result.success) return result;
    if (attempt < ICMP_PING_RETRIES) {
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }

  return { success: false, error: 'Ping timed out after retries (net-ping + system ping)' };
}

// ─── Poll a single device (multi-probe, ICMPv6-aware) ───────────────────────
async function pollDevice(session: NetPingSession | null, device: DeviceRecord): Promise<PingResult> {
  const ipv6 = isIPv6Address(device.ip);
  // ICMPv6: langsung ke system ping (net-ping biasanya IPv4 only)
  if (ipv6) {
    const r = await pingSystemMultiProbe(device.ip, DEFAULT_PING_TIMEOUT, 3);
    if (r.success) {
      return {
        deviceId: device.id, ip: device.ip,
        latency: r.avgLatency, rttMin: r.rttMin, rttMax: r.rttMax, jitter: r.jitter,
        packetLoss: 0, isIPv6: true, success: true,
      };
    }
    return { deviceId: device.id, ip: device.ip, latency: null, rttMin: null, rttMax: null, jitter: null, packetLoss: 100, isIPv6: true, success: false, error: r.error };
  }

  try {
    // IPv4: coba net-ping dulu untuk latensi akurat, lalu fallback
    let netPingOk = false;
    if (session) {
      const singleResult = await new Promise<{ latency: number; success: true } | { success: false; error: string }>((resolve) => {
        const sent = Date.now();
        session!.pingHost(device.ip, (err, _t, _s, rcvd) => {
          if (err) resolve({ success: false, error: err.message });
          else resolve({ latency: rcvd.getTime() - sent, success: true });
        });
      });
      if (singleResult.success) netPingOk = true;
      else if (singleResult.error.includes('EPERM') || singleResult.error.includes('EACCES')) {
        log('WARN', `net-ping permission error for ${device.ip}, using system ping`);
      }
    }
    if (netPingOk || !session) {
      // Gunakan system ping multi-probe untuk jitter/RTT detail
      const r = await pingSystemMultiProbe(device.ip, DEFAULT_PING_TIMEOUT, 3);
      if (r.success) {
        return {
          deviceId: device.id, ip: device.ip,
          latency: r.avgLatency, rttMin: r.rttMin, rttMax: r.rttMax, jitter: r.jitter,
          packetLoss: 0, isIPv6: false, success: true,
        };
      }
    }

    // net-ping fallback (single probe)
    if (session) {
      for (let attempt = 0; attempt <= ICMP_PING_RETRIES; attempt++) {
        const r = await pingHostSystem(device.ip, DEFAULT_PING_TIMEOUT);
        if (r.success) return { deviceId: device.id, ip: device.ip, latency: r.latency, rttMin: r.latency, rttMax: r.latency, jitter: 0, packetLoss: 0, isIPv6: false, success: true };
        if (attempt < ICMP_PING_RETRIES) await new Promise((res) => setTimeout(res, 500 * Math.pow(2, attempt)));
      }
    }

    return { deviceId: device.id, ip: device.ip, latency: null, rttMin: null, rttMax: null, jitter: null, packetLoss: 100, isIPv6: false, success: false, error: 'All ping attempts failed' };
  } catch (err) {
    return { deviceId: device.id, ip: device.ip, latency: null, rttMin: null, rttMax: null, jitter: null, packetLoss: 100, isIPv6: false, success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Alert transitions ────────────────────────────────────────────────────────
async function handleAlertTransition(device: DeviceRecord, newStatus: 'UP' | 'DOWN' | 'UNKNOWN'): Promise<void> {
  const previousStatus = device.status;

  if (await isDeviceInMaintenance(device.id)) {
    log('INFO', `[MAINTENANCE] Alerts suppressed for ${device.name} (${device.ip})`);
    return;
  }

  if (previousStatus === 'UP' && newStatus === 'DOWN') {
    const baseMessage = `Device ${device.name} (${device.ip}) is unreachable. ICMP ping failed after repeated attempts.`;
    const result = await processDeviceDownAlert(prisma, device, baseMessage);

    if (result.created) {
      log('WARN', `Alert DEVICE_DOWN created for ${device.name} (${device.ip}) severity=${result.alert.severity}`);
      await dispatchNotifications(prisma, {
        type: 'DEVICE_DOWN',
        severity: result.alert.severity,
        deviceId: device.id,
        deviceName: device.name,
        deviceIp: device.ip,
        message: `${device.name} (${device.ip}) tidak dapat dijangkau. Semua percobaan ping gagal.`,
        cooldownKey: 'default',
        cooldownMs: ICMP_ALERT_COOLDOWN_MS,
        alertId: result.alert.id,
        valueSnapshot: { status: 'DOWN', packetLoss: 100 },
      });
    } else {
      log('INFO', `Alert DEVICE_DOWN sudah aktif (dedupe) untuk ${device.name} (${device.ip})`);
    }
  }

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

    await dispatchNotifications(prisma, {
      type: 'DEVICE_UP',
      severity: 'MEDIUM',
      deviceId: device.id,
      deviceName: device.name,
      deviceIp: device.ip,
      message: `${device.name} (${device.ip}) kembali online dan dapat dijangkau.`,
      cooldownKey: 'default',
      cooldownMs: ICMP_ALERT_COOLDOWN_MS,
    });
  }
}

// ─── Persist results + recompute dynamic threshold ───────────────────────────
async function persistResults(results: PingResult[], deviceMap: Map<string, DeviceRecord>): Promise<void> {
  const settled = await Promise.allSettled(
    results.map(async (result) => {
      const device = deviceMap.get(result.deviceId);
      if (!device) return;

      const newStatus: 'UP' | 'DOWN' | 'UNKNOWN' = result.success ? 'UP' : 'DOWN';

      // Simpan metric dengan field baru: jitter, rttMin, rttMax, isIPv6
      await prisma.metric.create({
        data: {
          deviceId: result.deviceId,
          metricType: 'ICMP',
          latency: result.latency,
          packetLoss: result.packetLoss,
          jitter: result.jitter ?? null,
          rttMin: result.rttMin ?? null,
          rttMax: result.rttMax ?? null,
          isIPv6: result.isIPv6,
        },
      });

      // Forward ke SIEM (fire-and-forget, tidak block polling)
      void forwardMetricsToSiem(prisma, {
        device: { id: device.id, name: device.name, ip: device.ip },
        metricType: 'ICMP',
        metrics: {
          latency: result.latency ?? null,
          rttMin: result.rttMin ?? null,
          rttMax: result.rttMax ?? null,
          jitter: result.jitter ?? null,
          packetLoss: result.packetLoss,
          isIPv6: result.isIPv6,
          success: result.success,
        },
      }).catch(() => {});

      // Recompute dynamic threshold (async, tidak block alert logic)
      void computeAndSaveDynamicThreshold(prisma, result.deviceId, 'latency').catch(() => {});
      if (result.jitter !== null) {
        void computeAndSaveDynamicThreshold(prisma, result.deviceId, 'jitter').catch(() => {});
      }

      await handleAlertTransition(device, newStatus);

      await prisma.device.update({
        where: { id: result.deviceId },
        data: { status: newStatus },
      });
    })
  );

  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      log('ERROR', `Failed to persist result for device index ${i}`, r.reason);
    }
  });
}

// ─── Process batch dengan concurrency limit ───────────────────────────────────
async function processBatch(devices: DeviceRecord[], deviceMap: Map<string, DeviceRecord>): Promise<void> {
  let session: NetPingSession | null = null;

  try {
    try {
      session = ping.createSession({ timeout: DEFAULT_PING_TIMEOUT, retries: 0, packetSize: 64 });
    } catch (sessionErr) {
      log('WARN', `Failed to create net-ping session, using system ping fallback: ${sessionErr instanceof Error ? sessionErr.message : sessionErr}`);
      session = null;
    }

    // Parallel polling dengan batas concurrency — mencegah overload NIC
    const tasks = devices.map((device) => () => pollDevice(session, device));
    const settled = await pLimit(tasks, ICMP_CONCURRENCY_LIMIT);

    const results: PingResult[] = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      return {
        deviceId: devices[i].id,
        ip: devices[i].ip,
        latency: null,
        rttMin: null,
        rttMax: null,
        jitter: null,
        packetLoss: 100,
        isIPv6: false,
        success: false,
        error: String(s.reason),
      } satisfies PingResult;
    });

    await persistResults(results, deviceMap);

    const upCount   = results.filter((r) => r.success).length;
    const downCount = results.filter((r) => !r.success).length;
    log('INFO', `Batch complete: ${upCount} UP, ${downCount} DOWN / ${results.length} devices (concurrency=${ICMP_CONCURRENCY_LIMIT})`);
  } finally {
    if (session) {
      try { session.close(); } catch { /* ignore */ }
    }
  }
}

// ─── Overlap guard ────────────────────────────────────────────────────────────
let currentCycleId: string | null = null;

// ─── Main polling cycle dengan Redis queue ────────────────────────────────────
async function runPollCycle(): Promise<void> {
  if (currentCycleId) {
    log('WARN', `Skipping poll cycle — previous cycle [${currentCycleId}] still running`);
    return;
  }

  const cycleStart = Date.now();
  const cycleId = randomUUID();
  currentCycleId = cycleId;
  log('INFO', `Starting ICMP poll cycle [${cycleId}]`);

  try {
    const devices = await prisma.device.findMany({
      where: { status: { not: 'MAINTENANCE' }, deletedAt: null, isDemo: false },
      select: { id: true, name: true, ip: true, status: true, isDemo: true },
    });

    const demoCount = await prisma.device.count({
      where: { status: { not: 'MAINTENANCE' }, deletedAt: null, isDemo: true },
    });

    if (devices.length === 0 && demoCount === 0) {
      log('INFO', 'No active devices to poll');
      currentCycleId = null;
      return;
    }

    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    // ── Enqueue ke Redis (atau in-memory fallback) ────────────────────────────
    await enqueueDevices('icmp', devices.map((d) => d.id), REDIS_QUEUE_TTL_SECONDS);
    const queueStatus = await getQueueStatus('icmp');

    log('INFO', `Queue [${queueStatus.backend}] ${devices.length} REAL devices (+ ${demoCount} demo by demo-generator), batch=${ICMP_BATCH_SIZE}, concurrency=${ICMP_CONCURRENCY_LIMIT}`);

    // ── Dequeue & proses hingga antrian habis ─────────────────────────────────
    let batchNum = 0;
    let totalProcessed = 0;
    const totalBatches = Math.ceil(devices.length / ICMP_BATCH_SIZE);

    while (true) {
      const batchIds = await dequeueDevices('icmp', ICMP_BATCH_SIZE);
      if (batchIds.length === 0) break;

      batchNum++;
      log('INFO', `Processing batch ${batchNum}/${totalBatches} (${batchIds.length} devices)`);

      const batchDevices: DeviceRecord[] = batchIds
        .map((id) => deviceMap.get(id))
        .filter((d): d is NonNullable<typeof d> => d !== undefined);

      if (batchDevices.length > 0) {
        await processBatch(batchDevices, deviceMap);
        totalProcessed += batchDevices.length;
      }
    }

    const elapsed = Date.now() - cycleStart;
    log('INFO', `Poll cycle [${cycleId}] completed: ${totalProcessed} devices, ${batchNum} batches, ${elapsed}ms`);
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

  try { await closeRedis(); log('INFO', 'Redis connection closed'); } catch (err) { log('ERROR', 'Error closing Redis', err); }
  try { await prisma.$disconnect(); log('INFO', 'Prisma disconnected'); } catch (err) { log('ERROR', 'Error during shutdown', err); }

  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => void gracefulShutdown('SIGINT'));

// ─── Startup ──────────────────────────────────────────────────────────────────
log('INFO', `ICMP Poller v2 — batch=${ICMP_BATCH_SIZE}, concurrency=${ICMP_CONCURRENCY_LIMIT}, redis=${process.env.REDIS_URL ? 'enabled' : 'disabled (in-memory fallback)'}`);

void startPollScheduler({
  prisma,
  runCycle: runPollCycle,
  log,
  isShuttingDown: () => isShuttingDown,
});

log('INFO', 'ICMP Poller worker is running. Press Ctrl+C to stop.');
