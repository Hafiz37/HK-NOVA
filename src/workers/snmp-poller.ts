/**
 * SNMP Poller Worker
 * Standalone Node.js process for polling device metrics via SNMP.
 * Collects CPU utilization, memory utilization, and interface statistics.
 * Runs on node-cron schedule, uses queue-based batching with concurrency control.
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import {
  SNMP_BATCH_SIZE,
  SNMP_POLL_INTERVAL,
  SNMP_ALERT_COOLDOWN_MS,
  DEFAULT_SNMP_TIMEOUT,
  SNMP_HIGH_CPU_THRESHOLD,
  SNMP_HIGH_MEM_THRESHOLD,
} from '../lib/constants';
import { sendTelegramNotification, formatAlertMessage } from '../lib/telegram';

// ─── Prisma singleton for worker process ────────────────────────────────────
const prisma = new PrismaClient();

// ─── net-snmp (no @types package — use require with explicit any) ───────────
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const snmp = require('net-snmp') as any;

// ─── Standard OIDs ───────────────────────────────────────────────────────────
const OID = {
  // sysDescr, sysUpTime
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',

  // HOST-RESOURCES-MIB: CPU
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',      // table — per-CPU load

  // HOST-RESOURCES-MIB: Memory
  hrStorageType:   '1.3.6.1.2.1.25.2.3.1.2',      // table
  hrStorageSize:   '1.3.6.1.2.1.25.2.3.1.5',
  hrStorageUsed:   '1.3.6.1.2.1.25.2.3.1.6',

  // RAM type OID
  hrStorageRam: '1.3.6.1.2.1.25.2.1.2',

  // IF-MIB: Interface
  ifDescr:       '1.3.6.1.2.1.2.2.1.2',           // table
  ifOperStatus:  '1.3.6.1.2.1.2.2.1.8',
  ifSpeed:       '1.3.6.1.2.1.2.2.1.5',
  ifInOctets:    '1.3.6.1.2.1.2.2.1.10',
  ifOutOctets:   '1.3.6.1.2.1.2.2.1.16',
  ifInErrors:    '1.3.6.1.2.1.2.2.1.14',
  ifOutErrors:   '1.3.6.1.2.1.2.2.1.20',
} as const;

// ─── In-memory cooldown tracker ──────────────────────────────────────────────
const notificationCooldown = new Map<string, number>();

// ─── Types ───────────────────────────────────────────────────────────────────
interface SnmpCredential {
  snmpVersion: string;
  snmpCommunity: string;
  snmpUser?: string | null;
  snmpAuthPass?: string | null;
  snmpPrivPass?: string | null;
}

interface InterfaceEntry {
  index: number;
  name: string;
  operStatus: number; // 1=up, 2=down
  speed: number;      // bps
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
}

interface SnmpResult {
  deviceId: string;
  ip: string;
  success: boolean;
  error?: string;
  cpuUtil?: number | null;
  memUtil?: number | null;
  interfaces?: InterfaceEntry[];
}

// ─── Logging helper ──────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [SNMP-WORKER] [${level}] ${message}${metaStr}`);
}

// ─── Create SNMP session ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createSnmpSession(ip: string, cred: SnmpCredential): any | null {
  try {
    const versionStr = (cred.snmpVersion ?? 'v2c').toLowerCase();
    let version = snmp.Version2c as unknown;
    if (versionStr === 'v1' || versionStr === '1') version = snmp.Version1;
    if (versionStr === 'v3' || versionStr === '3') version = snmp.Version3;

    const community = cred.snmpCommunity ?? 'public';

    return snmp.createSession(ip, community, {
      port: 161,
      retries: 1,
      timeout: DEFAULT_SNMP_TIMEOUT,
      version,
    });
  } catch (err) {
    log('ERROR', `Failed to create SNMP session for ${ip}`, err);
    return null;
  }
}

// ─── Generic SNMP subtree walk ───────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function snmpSubtree(session: any, rootOid: string): Promise<Array<{ oid: string; value: unknown }>> {
  return new Promise((resolve) => {
    const results: Array<{ oid: string; value: unknown }> = [];
    session.subtree(
      rootOid,
      20,
      (varbinds: Array<{ oid: string; value: unknown; type: number }>) => {
        for (const v of varbinds) {
          if (!isVarbindError(v)) {
            results.push({ oid: v.oid, value: v.value });
          }
        }
      },
      (error: Error | null) => {
        if (error) {
          resolve([]);
        } else {
          resolve(results);
        }
      }
    );
  });
}

// ─── Extract index from OID tail ─────────────────────────────────────────────
function oidIndex(oid: string, baseOid: string): number {
  return parseInt(oid.slice(baseOid.length + 1), 10);
}

// ─── isVarbindError helper (for any-typed net-snmp) ──────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isVarbindError(v: any): boolean {
  return snmp.isVarbindError(v) as boolean;
}

// ─── Poll CPU from hrProcessorLoad ──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollCpu(session: any): Promise<number | null> {
  try {
    const rows = await snmpSubtree(session, OID.hrProcessorLoad);
    if (rows.length === 0) return null;
    const vals = rows.map((r) => Number(r.value)).filter((v) => !isNaN(v));
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  } catch {
    return null;
  }
}

// ─── Poll Memory from hrStorage ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollMemory(session: any): Promise<number | null> {
  try {
    const [types, sizes, useds] = await Promise.all([
      snmpSubtree(session, OID.hrStorageType),
      snmpSubtree(session, OID.hrStorageSize),
      snmpSubtree(session, OID.hrStorageUsed),
    ]);

    // Find RAM storage entries by type
    const ramIndexes = new Set<number>();
    for (const t of types) {
      if (String(t.value).includes('1.3.6.1.2.1.25.2.1.2') || t.value === OID.hrStorageRam) {
        ramIndexes.add(oidIndex(t.oid, OID.hrStorageType));
      }
    }

    // If no explicit RAM type, use first entry (common fallback)
    if (ramIndexes.size === 0 && sizes.length > 0) {
      ramIndexes.add(oidIndex(sizes[0].oid, OID.hrStorageSize));
    }

    const sizeMap = new Map<number, number>();
    const usedMap = new Map<number, number>();
    for (const s of sizes) sizeMap.set(oidIndex(s.oid, OID.hrStorageSize), Number(s.value));
    for (const u of useds) usedMap.set(oidIndex(u.oid, OID.hrStorageUsed), Number(u.value));

    let totalSize = 0;
    let totalUsed = 0;
    for (const idx of ramIndexes) {
      const sz = sizeMap.get(idx) ?? 0;
      const us = usedMap.get(idx) ?? 0;
      totalSize += sz;
      totalUsed += us;
    }

    if (totalSize === 0) return null;
    return (totalUsed / totalSize) * 100;
  } catch {
    return null;
  }
}

// ─── Poll Interfaces ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollInterfaces(session: any): Promise<InterfaceEntry[]> {
  try {
    const [descrs, statuses, speeds, inOcts, outOcts, inErrs, outErrs] = await Promise.all([
      snmpSubtree(session, OID.ifDescr),
      snmpSubtree(session, OID.ifOperStatus),
      snmpSubtree(session, OID.ifSpeed),
      snmpSubtree(session, OID.ifInOctets),
      snmpSubtree(session, OID.ifOutOctets),
      snmpSubtree(session, OID.ifInErrors),
      snmpSubtree(session, OID.ifOutErrors),
    ]);

    const toMap = (rows: Array<{ oid: string; value: unknown }>, base: string) =>
      new Map<number, unknown>(rows.map((r) => [oidIndex(r.oid, base), r.value]));

    const descrMap  = toMap(descrs,   OID.ifDescr);
    const statusMap = toMap(statuses, OID.ifOperStatus);
    const speedMap  = toMap(speeds,   OID.ifSpeed);
    const inMap     = toMap(inOcts,   OID.ifInOctets);
    const outMap    = toMap(outOcts,  OID.ifOutOctets);
    const inErrMap  = toMap(inErrs,   OID.ifInErrors);
    const outErrMap = toMap(outErrs,  OID.ifOutErrors);

    const interfaces: InterfaceEntry[] = [];
    for (const [idx] of descrMap) {
      interfaces.push({
        index:      idx,
        name:       String(descrMap.get(idx) ?? `if${idx}`),
        operStatus: Number(statusMap.get(idx) ?? 2),
        speed:      Number(speedMap.get(idx)  ?? 0),
        inOctets:   Number(inMap.get(idx)     ?? 0),
        outOctets:  Number(outMap.get(idx)    ?? 0),
        inErrors:   Number(inErrMap.get(idx)  ?? 0),
        outErrors:  Number(outErrMap.get(idx) ?? 0),
      });
    }

    return interfaces;
  } catch {
    return [];
  }
}

// ─── Poll a single device via SNMP ───────────────────────────────────────────
async function pollDevice(device: {
  id: string;
  ip: string;
  name: string;
  credential: SnmpCredential | null;
}): Promise<SnmpResult> {
  if (!device.credential) {
    return {
      deviceId: device.id,
      ip: device.ip,
      success: false,
      error: 'No SNMP credential configured',
    };
  }

  const session = createSnmpSession(device.ip, device.credential);
  if (!session) {
    return {
      deviceId: device.id,
      ip: device.ip,
      success: false,
      error: 'Failed to create SNMP session',
    };
  }

  try {
    const [cpuUtil, memUtil, interfaces] = await Promise.all([
      pollCpu(session),
      pollMemory(session),
      pollInterfaces(session),
    ]);

    session.close();

    return {
      deviceId: device.id,
      ip: device.ip,
      success: true,
      cpuUtil,
      memUtil,
      interfaces,
    };
  } catch (err) {
    try { session.close(); } catch { /* ignore */ }
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      deviceId: device.id,
      ip: device.ip,
      success: false,
      error: errMsg,
    };
  }
}

// ─── Alert: HIGH_UTILIZATION ─────────────────────────────────────────────────
async function handleUtilizationAlerts(
  device: { id: string; name: string; ip: string },
  cpuUtil: number | null | undefined,
  memUtil: number | null | undefined
): Promise<void> {
  const cpu = cpuUtil ?? 0;
  const mem = memUtil ?? 0;

  if (cpu >= SNMP_HIGH_CPU_THRESHOLD) {
    await prisma.alert.create({
      data: {
        type: 'HIGH_UTILIZATION',
        deviceId: device.id,
        message: `CPU utilization on ${device.name} (${device.ip}) is ${cpu.toFixed(1)}%, exceeding threshold of ${SNMP_HIGH_CPU_THRESHOLD}%.`,
        severity: cpu >= 95 ? 'CRITICAL' : 'HIGH',
        status: 'ACTIVE',
      },
    });

    const severity = cpu >= 95 ? 'CRITICAL' : 'HIGH';
    await sendNotificationWithCooldown(
      `${device.id}-cpu`,
      device.name,
      'HIGH_UTILIZATION',
      severity,
      `CPU ${device.name} (${device.ip}) mencapai ${cpu.toFixed(1)}% — melebihi batas ${SNMP_HIGH_CPU_THRESHOLD}%.`
    );
    log('WARN', `HIGH CPU alert for ${device.name}: ${cpu.toFixed(1)}%`);
  }

  if (mem >= SNMP_HIGH_MEM_THRESHOLD) {
    await prisma.alert.create({
      data: {
        type: 'HIGH_UTILIZATION',
        deviceId: device.id,
        message: `Memory utilization on ${device.name} (${device.ip}) is ${mem.toFixed(1)}%, exceeding threshold of ${SNMP_HIGH_MEM_THRESHOLD}%.`,
        severity: mem >= 95 ? 'CRITICAL' : 'HIGH',
        status: 'ACTIVE',
      },
    });

    const severity = mem >= 95 ? 'CRITICAL' : 'HIGH';
    await sendNotificationWithCooldown(
      `${device.id}-mem`,
      device.name,
      'HIGH_UTILIZATION',
      severity,
      `Memory ${device.name} (${device.ip}) mencapai ${mem.toFixed(1)}% — melebihi batas ${SNMP_HIGH_MEM_THRESHOLD}%.`
    );
    log('WARN', `HIGH MEMORY alert for ${device.name}: ${mem.toFixed(1)}%`);
  }
}

// ─── Cooldown-aware Telegram notification ────────────────────────────────────
async function sendNotificationWithCooldown(
  key: string,
  deviceName: string,
  type: string,
  severity: string,
  message: string
): Promise<void> {
  const lastNotified = notificationCooldown.get(key) ?? 0;
  const now = Date.now();

  if (now - lastNotified < SNMP_ALERT_COOLDOWN_MS) {
    log('INFO', `Notification cooldown active for ${key}, skipping Telegram`);
    return;
  }

  notificationCooldown.set(key, now);
  const formatted = formatAlertMessage(type, severity, deviceName, message);
  await sendTelegramNotification(formatted);
}

// ─── Persist SNMP results to DB ──────────────────────────────────────────────
async function persistResults(
  results: SnmpResult[],
  deviceMap: Map<string, { id: string; name: string; ip: string }>
): Promise<void> {
  const settledResults = await Promise.allSettled(
    results.map(async (result) => {
      const device = deviceMap.get(result.deviceId);
      if (!device) return;

      if (!result.success) {
        log('WARN', `SNMP poll failed for ${device.name} (${device.ip}): ${result.error}`);
        return;
      }

      // Persist metric
      await prisma.metric.create({
        data: {
          deviceId: result.deviceId,
          metricType: 'SNMP',
          cpuUtil: result.cpuUtil ?? null,
          memUtil: result.memUtil ?? null,
          interfaceData: result.interfaces && result.interfaces.length > 0
            ? (result.interfaces as unknown as import('@prisma/client').Prisma.JsonArray)
            : undefined,
        },
      });

      // Handle utilization alerts
      await handleUtilizationAlerts(device, result.cpuUtil, result.memUtil);

      log('INFO', `SNMP polled ${device.name} — CPU: ${result.cpuUtil?.toFixed(1) ?? 'N/A'}%, MEM: ${result.memUtil?.toFixed(1) ?? 'N/A'}%, Interfaces: ${result.interfaces?.length ?? 0}`);
    })
  );

  // Log persistence errors
  settledResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      log('ERROR', `Failed to persist SNMP result for device index ${i}`, r.reason);
    }
  });
}

// ─── Process a batch of devices ──────────────────────────────────────────────
async function processBatch(
  devices: Array<{
    id: string;
    name: string;
    ip: string;
    credential: SnmpCredential | null;
  }>,
  deviceMap: Map<string, { id: string; name: string; ip: string }>
): Promise<void> {
  const settled = await Promise.allSettled(
    devices.map((device) => pollDevice(device))
  );

  const results: SnmpResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      deviceId: devices[i].id,
      ip: devices[i].ip,
      success: false,
      error: String(s.reason),
    } satisfies SnmpResult;
  });

  await persistResults(results, deviceMap);

  const okCount   = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  log('INFO', `Batch complete: ${okCount} OK, ${failCount} FAILED out of ${results.length} devices`);
}

// ─── Main polling cycle ───────────────────────────────────────────────────────
async function runPollCycle(): Promise<void> {
  const cycleStart = Date.now();
  log('INFO', 'Starting SNMP poll cycle');

  try {
    // Fetch all active devices that have SNMP credentials
    const devices = await prisma.device.findMany({
      where: {
        status: { not: 'MAINTENANCE' },
        deletedAt: null,
        credentials: { isNot: null },
      },
      select: {
        id: true,
        name: true,
        ip: true,
        credentials: {
          select: {
            snmpVersion: true,
            snmpCommunity: true,
            snmpUser: true,
            snmpAuthPass: true,
            snmpPrivPass: true,
          },
        },
      },
    });

    if (devices.length === 0) {
      log('INFO', 'No active devices with SNMP credentials to poll');
      return;
    }

    // Normalize to flat structure
    const flatDevices = devices.map((d) => ({
      id: d.id,
      name: d.name,
      ip: d.ip,
      credential: d.credentials
        ? {
            snmpVersion:   d.credentials.snmpVersion   ?? 'v2c',
            snmpCommunity: d.credentials.snmpCommunity ?? 'public',
            snmpUser:      d.credentials.snmpUser,
            snmpAuthPass:  d.credentials.snmpAuthPass,
            snmpPrivPass:  d.credentials.snmpPrivPass,
          }
        : null,
    }));

    const deviceMap = new Map(flatDevices.map((d) => [d.id, d]));
    log('INFO', `Polling ${flatDevices.length} devices in batches of ${SNMP_BATCH_SIZE}`);

    for (let i = 0; i < flatDevices.length; i += SNMP_BATCH_SIZE) {
      const batch = flatDevices.slice(i, i + SNMP_BATCH_SIZE);
      const batchNum    = Math.floor(i / SNMP_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(flatDevices.length / SNMP_BATCH_SIZE);
      log('INFO', `Processing batch ${batchNum}/${totalBatches} (${batch.length} devices)`);
      await processBatch(batch, deviceMap);
    }

    const elapsed = Date.now() - cycleStart;
    log('INFO', `Poll cycle completed in ${elapsed}ms`);
  } catch (err) {
    log('ERROR', 'Poll cycle failed', err instanceof Error ? err.message : err);
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
process.on('SIGINT',  () => void gracefulShutdown('SIGINT'));

// ─── Startup ──────────────────────────────────────────────────────────────────
log('INFO', `SNMP Poller starting with schedule: "${SNMP_POLL_INTERVAL}", batch size: ${SNMP_BATCH_SIZE}`);

// Run once immediately on startup
void runPollCycle();

// Schedule recurring runs
cron.schedule(SNMP_POLL_INTERVAL, () => {
  if (!isShuttingDown) {
    void runPollCycle();
  }
});

log('INFO', 'SNMP Poller worker is running. Press Ctrl+C to stop.');
