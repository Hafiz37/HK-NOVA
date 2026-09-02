/**
 * SNMP Poller Worker — v2 (Optimasi Polling & Scalability)
 * Standalone Node.js process for polling device metrics via SNMP.
 * Collects CPU utilization, memory utilization, and interface statistics.
 * Interval diambil dari pengaturan DB (polling:real:interval) melalui scheduler
 * dinamis — bisa diubah dari UI tanpa restart.
 *
 * Optimasi v2:
 *  - Batch polling    : 20–50 device per batch (SNMP_BATCH_SIZE, default 20)
 *  - Parallel polling : pLimit() maks SNMP_CONCURRENCY_LIMIT concurrent (default 10)
 *  - Redis queue      : enqueue → dequeue per batch; fallback in-memory otomatis
 */

import { PrismaClient } from '@prisma/client';
import {
  SNMP_BATCH_SIZE,
  SNMP_CONCURRENCY_LIMIT,
  SNMP_ALERT_COOLDOWN_MS,
  DEFAULT_SNMP_TIMEOUT,
  REDIS_QUEUE_TTL_SECONDS,
} from '../lib/constants';
import {
  enqueueDevices,
  dequeueDevices,
  getQueueStatus,
  closeRedis,
  pLimit,
} from '../lib/redis-queue';
import { startPollScheduler } from '../lib/poll-scheduler';
import { randomUUID } from 'crypto';
import { dispatchNotifications } from '../lib/notifier';
import { isDeviceInMaintenance } from '../lib/maintenance';
import { resolveThresholds, type ThresholdOverrides } from '../lib/thresholds';
import {
  processUtilizationAlert,
  resolveUtilizationAlert,
  processCustomOidAlert,
  resolveCustomOidAlert,
  type CustomOidAlertInput,
} from '../lib/alert-engine';
import { fetchEnabledRules, evaluateRuleForDevice } from '../lib/alert-rules';
import {
  pollCustomOids,
  serializeCustomOidResults,
  type CustomOidRecord,
  type CustomOidResult,
} from '../lib/custom-oid';
import { forwardMetricsToSiem } from '../lib/siem-forward';

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
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2', // table — per-CPU load

  // HOST-RESOURCES-MIB: Memory
  hrStorageType: '1.3.6.1.2.1.25.2.3.1.2', // table
  hrStorageSize: '1.3.6.1.2.1.25.2.3.1.5',
  hrStorageUsed: '1.3.6.1.2.1.25.2.3.1.6',

  // RAM type OID
  hrStorageRam: '1.3.6.1.2.1.25.2.1.2',

  // IF-MIB: Interface (32-bit counters)
  ifDescr: '1.3.6.1.2.1.2.2.1.2', // table
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  ifSpeed: '1.3.6.1.2.1.2.2.1.5',
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',
  ifInErrors: '1.3.6.1.2.1.2.2.1.14',
  ifOutErrors: '1.3.6.1.2.1.2.2.1.20',

  // IF-MIB: Interface (64-bit counters — IF-MIB::ifHCInOctets / ifHCOutOctets)
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6', // 64-bit in octets
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10', // 64-bit out octets
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────
interface SnmpCredential {
  snmpVersion: string;
  snmpCommunity: string;
  snmpPort: number;
  snmpUser?: string | null;
  snmpAuthPass?: string | null;
  snmpPrivPass?: string | null;
}

interface InterfaceEntry {
  index: number;
  name: string;
  operStatus: number; // 1=up, 2=down
  speed: number; // bps
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
  customOidResults?: CustomOidPollResult[];
  customOidData?: Record<
    string,
    {
      name: string;
      value: number | string | null;
      unit: string | null;
      alertTriggered: string | null;
    }
  >;
}

/** Hasil poll custom OID + threshold pembanding (untuk logika alert). */
interface CustomOidPollResult extends CustomOidResult {
  customOidId: string; // id record CustomOid (untuk match rule)
  alertHigh: number | null;
  alertLow: number | null;
}

// Perangkat yang dipoll beserta threshold override-nya (null = gunakan global)
type PolledDevice = {
  id: string;
  name: string;
  ip: string;
  type: string;
  credential: SnmpCredential | null;
  customOids: CustomOidRecord[];
} & ThresholdOverrides;

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

    const port = cred.snmpPort ?? 161;
    const community = cred.snmpCommunity ?? 'public';

    // SNMPv3: pakai user name + passphrase (auth/priv). Community diabaikan.
    if (version === snmp.Version3) {
      const user = cred.snmpUser ?? '';
      const authPass = cred.snmpAuthPass ?? '';
      const privPass = cred.snmpPrivPass ?? '';
      const level = authPass && privPass ? 'authPriv' : authPass ? 'authNoPriv' : 'noAuthNoPriv';

      return snmp.createSession(ip, '', {
        port,
        retries: 1,
        timeout: DEFAULT_SNMP_TIMEOUT,
        version,
        user,
        name: '',
        level,
        authProtocol: 'sha',
        authKey: authPass,
        privProtocol: 'aes',
        privKey: privPass,
      });
    }

    return snmp.createSession(ip, community, {
      port,
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
/* eslint-disable @typescript-eslint/no-explicit-any */
function snmpSubtree(
  session: any,
  rootOid: string
): Promise<Array<{ oid: string; value: unknown }>> {
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
/* eslint-enable @typescript-eslint/no-explicit-any */

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
    // Try 64-bit counters first (IF-MIB::ifHCInOctets / ifHCOutOctets)
    const [descrs, statuses, speeds, inOcts, outOcts, inErrs, outErrs, inOcts64, outOcts64] =
      await Promise.all([
        snmpSubtree(session, OID.ifDescr),
        snmpSubtree(session, OID.ifOperStatus),
        snmpSubtree(session, OID.ifSpeed),
        snmpSubtree(session, OID.ifInOctets),
        snmpSubtree(session, OID.ifOutOctets),
        snmpSubtree(session, OID.ifInErrors),
        snmpSubtree(session, OID.ifOutErrors),
        snmpSubtree(session, OID.ifHCInOctets),
        snmpSubtree(session, OID.ifHCOutOctets),
      ]);

    const toMap = (rows: Array<{ oid: string; value: unknown }>, base: string) =>
      new Map<number, unknown>(rows.map((r) => [oidIndex(r.oid, base), r.value]));

    const descrMap = toMap(descrs, OID.ifDescr);
    const statusMap = toMap(statuses, OID.ifOperStatus);
    const speedMap = toMap(speeds, OID.ifSpeed);
    const inMap32 = toMap(inOcts, OID.ifInOctets);
    const outMap32 = toMap(outOcts, OID.ifOutOctets);
    const inMap64 = toMap(inOcts64, OID.ifHCInOctets);
    const outMap64 = toMap(outOcts64, OID.ifHCOutOctets);
    const inErrMap = toMap(inErrs, OID.ifInErrors);
    const outErrMap = toMap(outErrs, OID.ifOutErrors);

    const interfaces: InterfaceEntry[] = [];
    for (const [idx] of descrMap) {
      // Prefer 64-bit counters, fall back to 32-bit
      const inOctets = inMap64.has(idx) ? Number(inMap64.get(idx)) : Number(inMap32.get(idx) ?? 0);
      const outOctets = outMap64.has(idx)
        ? Number(outMap64.get(idx))
        : Number(outMap32.get(idx) ?? 0);

      interfaces.push({
        index: idx,
        name: String(descrMap.get(idx) ?? `if${idx}`),
        operStatus: Number(statusMap.get(idx) ?? 2),
        speed: Number(speedMap.get(idx) ?? 0),
        inOctets,
        outOctets,
        inErrors: Number(inErrMap.get(idx) ?? 0),
        outErrors: Number(outErrMap.get(idx) ?? 0),
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
  type: string;
  credential: SnmpCredential | null;
  customOids: CustomOidRecord[];
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
    const [cpuUtil, memUtil, interfaces, customOidResults] = await Promise.all([
      pollCpu(session),
      pollMemory(session),
      pollInterfaces(session),
      pollCustomOids(session, device.customOids),
    ]);

    session.close();

    // Enrich hasil custom OID dengan ambang threshold utk logika alert.
    const customOidEnriched: CustomOidPollResult[] = customOidResults
      .filter((r) => r.value !== null && typeof r.value === 'number')
      .map((r) => {
        const oid = device.customOids.find((o) => o.oid === r.oid);
        return {
          ...r,
          value: r.value as number,
          customOidId: oid?.id ?? '',
          alertHigh: oid?.alertHigh ?? null,
          alertLow: oid?.alertLow ?? null,
        };
      });

    return {
      deviceId: device.id,
      ip: device.ip,
      success: true,
      cpuUtil,
      memUtil,
      interfaces,
      customOidResults: customOidEnriched,
      customOidData: serializeCustomOidResults(customOidResults),
    };
  } catch (err) {
    try {
      session.close();
    } catch {
      /* ignore */
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      deviceId: device.id,
      ip: device.ip,
      success: false,
      error: errMsg,
    };
  }
}

// ─── Alert: HIGH_UTILIZATION (dedupe + korelasi + hysteresis auto-resolution) ─
async function handleUtilizationAlerts(
  device: PolledDevice,
  cpuUtil: number | null | undefined,
  memUtil: number | null | undefined
): Promise<void> {
  // Check if device is in maintenance window
  const isInMaintenance = await isDeviceInMaintenance(device.id);
  if (isInMaintenance) {
    log('INFO', `[MAINTENANCE] Alerts suppressed for device ${device.name} (${device.ip})`);
    return;
  }

  // Threshold efektif: pakai override per-device jika ada, else global
  const t = resolveThresholds(device);

  // Only process alerts when we have actual values (not null)
  // If SNMP failed to read CPU/MEM, don't create or resolve alerts

  // ── CPU alert / resolution ──────────────────────────────────────────────────
  if (cpuUtil !== null && cpuUtil !== undefined) {
    const cpu = cpuUtil;
    if (cpu >= t.cpuAlert) {
      const r = await processUtilizationAlert(prisma, {
        device,
        metric: 'cpu',
        value: cpu,
        threshold: t.cpuAlert,
      });

      if (r.action === 'created') {
        await sendNotificationWithCooldown({
          type: 'HIGH_UTILIZATION',
          severity: r.alert.severity,
          deviceId: device.id,
          deviceName: device.name,
          deviceIp: device.ip,
          message: `CPU ${device.name} (${device.ip}) mencapai ${cpu.toFixed(1)}% — melebihi batas ${t.cpuAlert}%.`,
          cooldownKey: 'cpu',
          cooldownMs: SNMP_ALERT_COOLDOWN_MS,
          alertId: r.alert.id,
          valueSnapshot: { cpu },
        });
        log(
          'WARN',
          `HIGH CPU alert created for ${device.name}: ${cpu.toFixed(1)}% (threshold ${t.cpuAlert}%, severity ${r.alert.severity})`
        );
      } else if (r.action === 'correlated') {
        await sendNotificationWithCooldown({
          type: 'HIGH_UTILIZATION_CORRELATED',
          severity: 'CRITICAL',
          deviceId: device.id,
          deviceName: device.name,
          deviceIp: device.ip,
          message: `CPU ${device.name} (${device.ip}) ${cpu.toFixed(1)}% — perangkat DOWN, alert DEVICE_DOWN dinaikkan ke CRITICAL.`,
          cooldownKey: 'cpu',
          cooldownMs: SNMP_ALERT_COOLDOWN_MS,
        });
        log(
          'WARN',
          `[CORRELATED] CPU ${device.name}: ${cpu.toFixed(1)}% saat perangkat DOWN — DEVICE_DOWN dinaikkan ke CRITICAL`
        );
      }
      // duplicate → no-op
    } else if (cpu < t.cpuResolve) {
      // Hysteresis: CPU dropped below resolve threshold
      const resolved = await resolveUtilizationAlert(prisma, {
        deviceId: device.id,
        metric: 'cpu',
        value: cpu,
        resolveThreshold: t.cpuResolve,
      });
      if (resolved > 0) {
        log(
          'INFO',
          `AUTO-RESOLVED ${resolved} HIGH_CPU alert(s) for ${device.name}: CPU now ${cpu.toFixed(1)}% (below ${t.cpuResolve}%)`
        );
        await sendNotificationWithCooldown({
          type: 'HIGH_UTILIZATION_RESOLVED',
          severity: 'INFO',
          deviceId: device.id,
          deviceName: device.name,
          deviceIp: device.ip,
          message: `CPU ${device.name} (${device.ip}) kembali normal: ${cpu.toFixed(1)}% (batas resolve: ${t.cpuResolve}%).`,
          cooldownKey: 'cpu-recover',
          cooldownMs: SNMP_ALERT_COOLDOWN_MS,
        });
      }
    }
  }

  // ── Memory alert / resolution ───────────────────────────────────────────────
  if (memUtil !== null && memUtil !== undefined) {
    const mem = memUtil;
    if (mem >= t.memAlert) {
      const r = await processUtilizationAlert(prisma, {
        device,
        metric: 'mem',
        value: mem,
        threshold: t.memAlert,
      });

      if (r.action === 'created') {
        await sendNotificationWithCooldown({
          type: 'HIGH_UTILIZATION',
          severity: r.alert.severity,
          deviceId: device.id,
          deviceName: device.name,
          deviceIp: device.ip,
          message: `Memory ${device.name} (${device.ip}) mencapai ${mem.toFixed(1)}% — melebihi batas ${t.memAlert}%.`,
          cooldownKey: 'mem',
          cooldownMs: SNMP_ALERT_COOLDOWN_MS,
          alertId: r.alert.id,
          valueSnapshot: { mem },
        });
        log(
          'WARN',
          `HIGH MEMORY alert created for ${device.name}: ${mem.toFixed(1)}% (threshold ${t.memAlert}%, severity ${r.alert.severity})`
        );
      } else if (r.action === 'correlated') {
        await sendNotificationWithCooldown({
          type: 'HIGH_UTILIZATION_CORRELATED',
          severity: 'CRITICAL',
          deviceId: device.id,
          deviceName: device.name,
          deviceIp: device.ip,
          message: `Memory ${device.name} (${device.ip}) ${mem.toFixed(1)}% — perangkat DOWN, alert DEVICE_DOWN dinaikkan ke CRITICAL.`,
          cooldownKey: 'mem',
          cooldownMs: SNMP_ALERT_COOLDOWN_MS,
        });
        log(
          'WARN',
          `[CORRELATED] Memory ${device.name}: ${mem.toFixed(1)}% saat perangkat DOWN — DEVICE_DOWN dinaikkan ke CRITICAL`
        );
      }
      // duplicate → no-op
    } else if (mem < t.memResolve) {
      // Hysteresis: Memory dropped below resolve threshold
      const resolved = await resolveUtilizationAlert(prisma, {
        deviceId: device.id,
        metric: 'mem',
        value: mem,
        resolveThreshold: t.memResolve,
      });
      if (resolved > 0) {
        log(
          'INFO',
          `AUTO-RESOLVED ${resolved} HIGH_MEM alert(s) for ${device.name}: MEM now ${mem.toFixed(1)}% (below ${t.memResolve}%)`
        );
        await sendNotificationWithCooldown({
          type: 'HIGH_UTILIZATION_RESOLVED',
          severity: 'INFO',
          deviceId: device.id,
          deviceName: device.name,
          deviceIp: device.ip,
          message: `Memory ${device.name} (${device.ip}) kembali normal: ${mem.toFixed(1)}% (batas resolve: ${t.memResolve}%).`,
          cooldownKey: 'mem-recover',
          cooldownMs: SNMP_ALERT_COOLDOWN_MS,
        });
      }
    }
  }
}

// ─── Alert: CUSTOM OID (threshold CustomOid.alertHigh / alertLow) ─────────────
async function handleCustomOidAlerts(
  device: PolledDevice,
  customOidResults: CustomOidPollResult[]
): Promise<void> {
  if (customOidResults.length === 0) return;

  if (await isDeviceInMaintenance(device.id)) {
    log('INFO', `[MAINTENANCE] Custom OID alerts suppressed for ${device.name} (${device.ip})`);
    return;
  }

  for (const r of customOidResults) {
    const alertInput: CustomOidAlertInput = {
      oid: r.oid,
      name: r.name,
      value: Number(r.value),
      unit: r.unit,
      direction: r.alertTriggered as 'HIGH' | 'LOW',
      alertHigh: r.alertHigh,
      alertLow: r.alertLow,
    };

    if (r.alertTriggered === 'HIGH' || r.alertTriggered === 'LOW') {
      const res = await processCustomOidAlert(prisma, device, alertInput);

      if (res.created && res.alert) {
        await sendNotificationWithCooldown({
          type: 'CUSTOM_OID_OUT_OF_RANGE',
          severity: res.alert.severity,
          deviceId: device.id,
          deviceName: device.name,
          deviceIp: device.ip,
          message: res.alert.message,
          cooldownKey: `custom:${r.oid}`,
          cooldownMs: SNMP_ALERT_COOLDOWN_MS,
          alertId: res.alert.id,
          valueSnapshot: { oid: r.oid, name: r.name, value: r.value, direction: r.alertTriggered },
        });
        log(
          'WARN',
          `CUSTOM OID alert for ${device.name} "${r.name}" (${r.oid}): value ${r.value}${r.unit ?? ''} — severity ${res.alert.severity}`
        );
      }
    } else {
      const resolved = await resolveCustomOidAlert(prisma, device.id, r.oid);
      if (resolved > 0) {
        log(
          'INFO',
          `AUTO-RESOLVED ${resolved} custom OID alert(s) for ${device.name} "${r.name}": kembali normal.`
        );
      }
    }
  }
}

// ─── Rule evaluasi (Tahap 3) — nilai SEGAR dari hasil poll ────────────────────
async function handleRuleAlerts(
  device: PolledDevice,
  cpuUtil: number | null | undefined,
  memUtil: number | null | undefined,
  customOidResults: CustomOidPollResult[],
  rules: Awaited<ReturnType<typeof fetchEnabledRules>>
): Promise<void> {
  if (rules.length === 0) return;

  const ruleDevice = { id: device.id, name: device.name, ip: device.ip, type: device.type };

  const dispatchRule = async (rule: (typeof rules)[number], metric: string, value: number) => {
    const res = await evaluateRuleForDevice(prisma, rule, ruleDevice, value);
    if (res?.created && res.alert) {
      await sendNotificationWithCooldown({
        type: 'RULE_BREACH',
        severity: res.alert.severity,
        deviceId: device.id,
        deviceName: device.name,
        deviceIp: device.ip,
        message: res.alert.message,
        cooldownKey: `rule:${rule.id}`,
        cooldownMs: rule.cooldownMs || SNMP_ALERT_COOLDOWN_MS,
        alertId: res.alert.id,
        valueSnapshot: { ruleId: rule.id, metric, value },
      });
      log('WARN', `RULE_BREACH untuk ${device.name} (${metric}=${value}) — rule ${rule.name}`);
    }
  };

  for (const rule of rules) {
    if (rule.metric === 'cpu' && cpuUtil != null) await dispatchRule(rule, 'cpu', cpuUtil);
    if (rule.metric === 'mem' && memUtil != null) await dispatchRule(rule, 'mem', memUtil);
    if (rule.metric === 'customOid') {
      for (const r of customOidResults) {
        if (rule.customOidId && r.customOidId === rule.customOidId) {
          await dispatchRule(rule, 'customOid', Number(r.value));
        }
      }
    }
  }
}

// ─── Cooldown-aware multi-channel notification ───────────────────────────────
async function sendNotificationWithCooldown(payload: {
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  type: string;
  severity: string;
  message: string;
  cooldownKey: string;
  cooldownMs: number;
  alertId?: string;
  valueSnapshot?: Record<string, unknown>;
}): Promise<void> {
  try {
    const result = await dispatchNotifications(prisma, payload);
    if (result.sent.length > 0) {
      log('INFO', `Notification sent via: ${result.sent.join(', ')}`);
    }
    if (result.skipped.length > 0) {
      log('INFO', `Notification skipped (disabled/cooldown) for: ${result.skipped.join(', ')}`);
    }
    if (result.failed.length > 0) {
      log('WARN', `Notification failed for: ${result.failed.join(', ')}`);
    }
  } catch (err) {
    log('ERROR', 'Failed to dispatch notification', err instanceof Error ? err.message : err);
  }
}

// ─── Persist SNMP results to DB ──────────────────────────────────────────────
async function persistResults(
  results: SnmpResult[],
  deviceMap: Map<string, PolledDevice>,
  rules: Awaited<ReturnType<typeof fetchEnabledRules>>
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
          interfaceData:
            result.interfaces && result.interfaces.length > 0
              ? (result.interfaces as unknown as import('@prisma/client').Prisma.JsonArray)
              : undefined,
          customOidData:
            result.customOidData && Object.keys(result.customOidData).length > 0
              ? (result.customOidData as unknown as import('@prisma/client').Prisma.JsonObject)
              : undefined,
        },
      });

      // Forward ke SIEM (fire-and-forget, tidak block polling)
      void forwardMetricsToSiem(prisma, {
        device: { id: device.id, name: device.name, ip: device.ip },
        metricType: 'SNMP',
        metrics: {
          cpuUtil: result.cpuUtil ?? null,
          memUtil: result.memUtil ?? null,
          interfaces:
            result.interfaces?.map((iface) => ({
              index: iface.index,
              name: iface.name,
              operStatus: iface.operStatus,
              speed: iface.speed,
              inOctets: iface.inOctets,
              outOctets: iface.outOctets,
              inErrors: iface.inErrors,
              outErrors: iface.outErrors,
            })) ?? [],
          customOids: result.customOidData ?? {},
        },
      }).catch((err) => {
        log('error', 'Failed to record SNMP activity', { deviceId: device.id, error: err instanceof Error ? err.message : String(err) });
      });

      // Handle utilization alerts
      await handleUtilizationAlerts(device, result.cpuUtil, result.memUtil);

      // Handle custom OID threshold alerts
      await handleCustomOidAlerts(device, result.customOidResults ?? []);

      // Evaluasi rule user-defined (nilai segar dari hasil poll)
      await handleRuleAlerts(
        device,
        result.cpuUtil,
        result.memUtil,
        result.customOidResults ?? [],
        rules
      );

      log(
        'INFO',
        `SNMP polled ${device.name} — CPU: ${result.cpuUtil?.toFixed(1) ?? 'N/A'}%, MEM: ${result.memUtil?.toFixed(1) ?? 'N/A'}%, Interfaces: ${result.interfaces?.length ?? 0}`
      );
    })
  );

  // Log persistence errors
  settledResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      log('ERROR', `Failed to persist SNMP result for device index ${i}`, r.reason);
    }
  });
}

// ─── Process a batch of devices dengan concurrency limit ─────────────────────
//
// pLimit() memastikan maks SNMP_CONCURRENCY_LIMIT SNMP session aktif serentak.
// Ini mencegah ledakan koneksi dan overload device pada batch besar (20–50).
//
async function processBatch(
  devices: PolledDevice[],
  deviceMap: Map<string, PolledDevice>,
  rules: Awaited<ReturnType<typeof fetchEnabledRules>>
): Promise<void> {
  // Bungkus sebagai lazy tasks agar pLimit bisa kontrol concurrency
  const tasks = devices.map((device) => () => pollDevice(device));
  const settled = await pLimit(tasks, SNMP_CONCURRENCY_LIMIT);

  const results: SnmpResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      deviceId: devices[i].id,
      ip: devices[i].ip,
      success: false,
      error: String(s.reason),
    } satisfies SnmpResult;
  });

  await persistResults(results, deviceMap, rules);

  const okCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  log(
    'INFO',
    `Batch complete: ${okCount} OK, ${failCount} FAILED / ${results.length} devices (concurrency=${SNMP_CONCURRENCY_LIMIT})`
  );
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
  log('INFO', `Starting SNMP poll cycle [${cycleId}]`);

  try {
    // Fetch all active devices that have SNMP credentials (exclude demo - handled by demo-generator)
    const devices = await prisma.device.findMany({
      where: {
        status: { not: 'MAINTENANCE' },
        deletedAt: null,
        credentials: { isNot: null },
        isDemo: false,
      },
      select: {
        id: true,
        name: true,
        ip: true,
        type: true,
        cpuThresholdOverride: true,
        memThresholdOverride: true,
        cpuResolveThresholdOverride: true,
        memResolveThresholdOverride: true,
        customOids: {
          where: { enabled: true },
          select: {
            id: true,
            name: true,
            oid: true,
            unit: true,
            description: true,
            alertHigh: true,
            alertLow: true,
            enabled: true,
          },
        },
        credentials: {
          select: {
            snmpVersion: true,
            snmpCommunity: true,
            snmpPort: true,
            snmpUser: true,
            snmpAuthPass: true,
            snmpPrivPass: true,
          },
        },
      },
    });

    if (devices.length === 0) {
      log('INFO', 'No active devices with SNMP credentials to poll');
      currentCycleId = null;
      return;
    }

    // Normalize to flat structure
    const flatDevices = devices.map((d) => ({
      id: d.id,
      name: d.name,
      ip: d.ip,
      type: d.type,
      cpuThresholdOverride: d.cpuThresholdOverride,
      memThresholdOverride: d.memThresholdOverride,
      cpuResolveThresholdOverride: d.cpuResolveThresholdOverride,
      memResolveThresholdOverride: d.memResolveThresholdOverride,
      customOids: d.customOids.map((o) => ({
        id: o.id,
        name: o.name,
        oid: o.oid,
        unit: o.unit,
        description: o.description,
        alertHigh: o.alertHigh,
        alertLow: o.alertLow,
        enabled: o.enabled,
      })),
      credential: d.credentials
        ? {
            snmpVersion: d.credentials.snmpVersion ?? 'v2c',
            snmpCommunity: d.credentials.snmpCommunity ?? 'public',
            snmpPort: d.credentials.snmpPort ?? 161,
            snmpUser: d.credentials.snmpUser,
            snmpAuthPass: d.credentials.snmpAuthPass,
            snmpPrivPass: d.credentials.snmpPrivPass,
          }
        : null,
    }));

    const deviceMap = new Map(flatDevices.map((d) => [d.id, d]));

    // ── Enqueue ke Redis (atau in-memory fallback) ──────────────────────────
    await enqueueDevices(
      'snmp',
      flatDevices.map((d) => d.id),
      REDIS_QUEUE_TTL_SECONDS
    );
    const queueStatus = await getQueueStatus('snmp');
    log(
      'INFO',
      `Queue [${queueStatus.backend}] ${flatDevices.length} devices, batch=${SNMP_BATCH_SIZE}, concurrency=${SNMP_CONCURRENCY_LIMIT}`
    );

    // Rule user-defined aktif (dievaluasi sekali per siklus terhadap nilai segar)
    const enabledRules = await fetchEnabledRules(prisma);

    // ── Dequeue & proses hingga antrian habis ──────────────────────────────
    let batchNum = 0;
    let totalProcessed = 0;
    const totalBatches = Math.ceil(flatDevices.length / SNMP_BATCH_SIZE);

    while (true) {
      const batchIds = await dequeueDevices('snmp', SNMP_BATCH_SIZE);
      if (batchIds.length === 0) break;

      batchNum++;
      log('INFO', `Processing batch ${batchNum}/${totalBatches} (${batchIds.length} devices)`);

      const batchDevices: PolledDevice[] = batchIds
        .map((id) => deviceMap.get(id))
        .filter((d): d is NonNullable<typeof d> => d !== undefined);

      if (batchDevices.length > 0) {
        await processBatch(batchDevices, deviceMap, enabledRules);
        totalProcessed += batchDevices.length;
      }
    }

    const elapsed = Date.now() - cycleStart;
    log(
      'INFO',
      `Poll cycle [${cycleId}] completed: ${totalProcessed} devices, ${batchNum} batches, ${elapsed}ms`
    );
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
    await closeRedis();
    log('INFO', 'Redis connection closed');
  } catch (err) {
    log('ERROR', 'Error closing Redis', err);
  }
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
log(
  'INFO',
  `SNMP Poller v2 — batch=${SNMP_BATCH_SIZE}, concurrency=${SNMP_CONCURRENCY_LIMIT}, redis=${process.env.REDIS_URL ? 'enabled' : 'disabled (in-memory fallback)'}`
);

void startPollScheduler({
  prisma,
  runCycle: runPollCycle,
  log,
  isShuttingDown: () => isShuttingDown,
  lockResource: 'worker:snmp:cycle',
});

log('INFO', 'SNMP Poller worker is running. Press Ctrl+C to stop.');
