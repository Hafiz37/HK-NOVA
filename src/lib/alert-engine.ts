import {
  PrismaClient,
  Prisma,
  AlertStatus,
  AlertSeverity,
  AlertType,
  AlertActivityAction,
} from '@prisma/client';
import {
  bumpStreak,
  resetStreak,
  DEFAULT_MIN_CONSECUTIVE,
} from './alert-streak';

/**
 * Alert Engine — deduplikasi & korelasi alert ICMP+SNMP.
 * Digunakan bersama oleh icmp-poller dan snmp-poller.
 *
 * Model korelasi (Gabung + Eskalasi):
 * - DEVICE_DOWN adalah induk. Bila perangkat sedang HIGH_UTILIZATION saat down,
 *   severity DEVICE_DOWN dinaikkan ke CRITICAL dan HIGH_UTILIZATION di-resolve
 *   sebagai child alert (parentId → DEVICE_DOWN).
 * - Sebaliknya, bila HIGH_UTILIZATION muncul saat perangkat sedang DOWN,
 *   alert utilization TIDAK dibuat — cukup eskalasi DEVICE_DOWN & tambah catatan.
 */

export interface AlertDevice {
  id: string;
  name: string;
  ip: string;
}

const OPEN_STATUSES: AlertStatus[] = ['ACTIVE', 'ACKNOWLEDGED'];

// ─── Dedup keys & correlation key ────────────────────────────────────────────
export const dedupKeyDown = (deviceId: string): string => `icmp:down:${deviceId}`;
export const dedupKeyUp = (deviceId: string): string => `icmp:up:${deviceId}`;
export const dedupKeyCpu = (deviceId: string): string => `snmp:cpu:${deviceId}`;
export const dedupKeyMem = (deviceId: string): string => `snmp:mem:${deviceId}`;
export const dedupKeyAnomaly = (deviceId: string, metricType: string): string => `anomaly:${metricType}:${deviceId}`;
export const dedupKeyCustomOid = (deviceId: string, oid: string): string => `custom:oid:${deviceId}:${oid}`;
export const correlationKeyFor = (deviceId: string): string => `device:${deviceId}`;

// ─── Helper query ─────────────────────────────────────────────────────────────
async function findOpenByDedupKey(
  prisma: PrismaClient,
  dedupKey: string
) {
  return prisma.alert.findFirst({
    where: { dedupKey, status: { in: OPEN_STATUSES } },
  });
}

export interface ActivityActor {
  id?: string;
  name?: string;
}

/**
 * Catat satu event ke timeline alert (AlertActivity). Best-effort:
 * kegagalan mencatat aktivitas tidak boleh menggagalkan aksi utama.
 */
export async function recordAlertActivity(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    alertId: string;
    action: AlertActivityAction;
    actor?: ActivityActor;
    message?: string;
    details?: Prisma.JsonObject;
  }
): Promise<void> {
  try {
    await prisma.alertActivity.create({
      data: {
        alertId: input.alertId,
        action: input.action,
        actorId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? null,
        message: input.message ?? null,
        details: input.details ?? undefined,
      },
    });
  } catch (err) {
    console.error('[AlertEngine] Failed to record alert activity', err);
  }
}

// ─── Generic create-if-not-duplicate ──────────────────────────────────────────
export async function createAlertIfNotDuplicate(
  prisma: PrismaClient,
  input: {
    type: AlertType;
    deviceId: string;
    message: string;
    severity: AlertSeverity;
    dedupKey?: string;
    correlationKey?: string;
    status?: AlertStatus;
    resolvedAt?: Date;
    valueSnapshot?: Prisma.JsonObject;
    actor?: ActivityActor;
  }
): Promise<{ created: boolean; alert: { id: string; severity: AlertSeverity; message: string } }> {
  if (input.dedupKey) {
    const existing = await findOpenByDedupKey(prisma, input.dedupKey);
    if (existing) {
      return { created: false, alert: existing };
    }
  }

  const now = new Date();
  const alert = await prisma.alert.create({
    data: {
      type: input.type,
      deviceId: input.deviceId,
      message: input.message,
      severity: input.severity,
      status: input.status ?? 'ACTIVE',
      dedupKey: input.dedupKey,
      correlationKey: input.correlationKey,
      resolvedAt: input.resolvedAt,
      firstTriggeredAt: now,
      valueSnapshot: input.valueSnapshot ?? undefined,
    },
  });

  await recordAlertActivity(prisma, {
    alertId: alert.id,
    action: 'CREATED',
    actor: input.actor,
    message: input.message,
    details: input.valueSnapshot ? { valueSnapshot: input.valueSnapshot } : undefined,
  });

  return { created: true, alert };
}

// ─── DEVICE_DOWN: dedupe + absorb & escalate HIGH_UTILIZATION ────────────────
export async function processDeviceDownAlert(
  prisma: PrismaClient,
  device: AlertDevice,
  baseMessage: string
): Promise<{ created: boolean; alert: { id: string; severity: AlertSeverity; message: string } }> {
  const dedupKey = dedupKeyDown(device.id);
  const correlationKey = correlationKeyFor(device.id);

  // Ambil / buat alert DEVICE_DOWN (dedupe)
  const down = await createAlertIfNotDuplicate(prisma, {
    type: 'DEVICE_DOWN',
    deviceId: device.id,
    message: baseMessage,
    severity: 'HIGH',
    dedupKey,
    correlationKey,
  });
  const downAlert = down.alert;

  // Cari HIGH_UTILIZATION yang masih terbuka pada perangkat yang sama
  const utilAlerts = await prisma.alert.findMany({
    where: {
      deviceId: device.id,
      type: 'HIGH_UTILIZATION',
      status: { in: OPEN_STATUSES },
    },
  });

  if (utilAlerts.length > 0) {
    // Gabung + eskalasi: DEVICE_DOWN naik ke CRITICAL, utilization menjadi child
    const notes = utilAlerts
      .map((a) => a.message)
      .join('; ');

    const escalatedMessage = `${downAlert.message}\n[Terkorelasi] ${notes}`;

    await prisma.alert.update({
      where: { id: downAlert.id },
      data: {
        severity: 'CRITICAL',
        message: escalatedMessage,
        correlationKey,
      },
    });

    await prisma.alert.updateMany({
      where: { id: { in: utilAlerts.map((a) => a.id) } },
      data: {
        parentId: downAlert.id,
        correlationKey,
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    return {
      created: down.created,
      alert: {
        id: downAlert.id,
        severity: 'CRITICAL',
        message: escalatedMessage,
      },
    };
  }

  return {
    created: down.created,
    alert: {
      id: downAlert.id,
      severity: downAlert.severity as AlertSeverity,
      message: downAlert.message,
    },
  };
}

// ─── HIGH_UTILIZATION: dedupe + suppress/escalate bila perangkat DOWN ─────────
export async function processUtilizationAlert(
  prisma: PrismaClient,
  input: {
    device: AlertDevice;
    metric: 'cpu' | 'mem';
    value: number;
    threshold: number;
    minConsecutive?: number;
  }
): Promise<
  | { action: 'created'; alert: { id: string; severity: AlertSeverity; message: string } }
  | { action: 'duplicate' }
  | { action: 'correlated' }
> {
  const { device, metric, value, threshold } = input;
  const dedupKey = metric === 'cpu' ? dedupKeyCpu(device.id) : dedupKeyMem(device.id);
  const correlationKey = correlationKeyFor(device.id);

  const message =
    `${metric === 'cpu' ? 'CPU' : 'Memory'} utilization on ${device.name} (${device.ip}) is ${value.toFixed(1)}%, ` +
    `exceeding threshold of ${threshold}%.`;

  // Dedupe: sudah ada alert aktif untuk metrik ini
  const existing = await findOpenByDedupKey(prisma, dedupKey);
  if (existing) {
    return { action: 'duplicate' };
  }

  // Anti-flapping: tunggu N sampel berturut-turut sebelum alert diangkat.
  const streak = bumpStreak(`snmp:${metric}:${device.id}`, input.minConsecutive ?? DEFAULT_MIN_CONSECUTIVE);
  if (!streak.qualifies) {
    return { action: 'duplicate' };
  }

  // Korelasi: perangkat sedang DOWN → jangan buat alert utilization,
  // cukup eskalasi DEVICE_DOWN & tambahkan catatan
  const down = await prisma.alert.findFirst({
    where: {
      deviceId: device.id,
      type: 'DEVICE_DOWN',
      status: { in: OPEN_STATUSES },
    },
  });

  if (down) {
    const severity = value >= 95 ? 'CRITICAL' : 'HIGH';
    const summary =
      metric === 'cpu' ? `CPU ${value.toFixed(1)}%` : `Memory ${value.toFixed(1)}%`;

    // Dedupe child korelasi: cegah pertumbuhan baris tak terbatas selagi
    // perangkat DOWN + utilization tinggi (dicek sekali, eskalasi sekali).
    const existingChild = await prisma.alert.findFirst({
      where: { dedupKey, parentId: down.id },
      select: { id: true },
    });

    if (!existingChild) {
      await prisma.alert.update({
        where: { id: down.id },
        data: {
          severity: 'CRITICAL',
          correlationKey,
          message: `${down.message}\n[Terkorelasi] ${summary} (threshold ${threshold}%)`,
        },
      });

      // Catat utilization sebagai child (sudah resolved) untuk jejak audit
      const child = await prisma.alert.create({
        data: {
          type: 'HIGH_UTILIZATION',
          deviceId: device.id,
          message,
          severity,
          status: 'RESOLVED',
          resolvedAt: new Date(),
          firstTriggeredAt: new Date(),
          valueSnapshot: { [metric]: value },
          dedupKey,
          correlationKey,
          parentId: down.id,
        },
      });

      await recordAlertActivity(prisma, {
        alertId: child.id,
        action: 'CREATED',
        message,
        details: { correlatedTo: down.id, value },
      });
    }

    return { action: 'correlated' };
  }

  // Normal: buat alert utilization baru
  const created = await prisma.alert.create({
    data: {
      type: 'HIGH_UTILIZATION',
      deviceId: device.id,
      message,
      severity: value >= 95 ? 'CRITICAL' : 'HIGH',
      status: 'ACTIVE',
      dedupKey,
      correlationKey,
      firstTriggeredAt: new Date(),
      valueSnapshot: { [metric]: value },
    },
  });

  await recordAlertActivity(prisma, {
    alertId: created.id,
    action: 'CREATED',
    message,
    details: { value, threshold },
  });

  return { action: 'created', alert: created };
}

// ─── Resolve HIGH_UTILIZATION (hysteresis) ───────────────────────────────────
export async function resolveUtilizationAlert(
  prisma: PrismaClient,
  input: {
    deviceId: string;
    metric: 'cpu' | 'mem';
    value: number;
    resolveThreshold: number;
  }
): Promise<number> {
  const dedupKey = input.metric === 'cpu' ? dedupKeyCpu(input.deviceId) : dedupKeyMem(input.deviceId);

  // Pulih dari breach → reset streak agar siklus anti-flapping mulai dari nol.
  resetStreak(`snmp:${input.metric}:${input.deviceId}`);

  const open = await prisma.alert.findMany({
    where: { dedupKey, status: { in: OPEN_STATUSES } },
    select: { id: true },
  });

  const resolved = await prisma.alert.updateMany({
    where: { id: { in: open.map((o) => o.id) } },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });

  await Promise.all(
    open.map((o) =>
      recordAlertActivity(prisma, {
        alertId: o.id,
        action: 'RESOLVED',
        message: `${input.metric === 'cpu' ? 'CPU' : 'Memory'} kembali di bawah ${input.resolveThreshold}% (${input.value.toFixed(1)}%)`,
        details: { autoResolved: true, value: input.value, resolveThreshold: input.resolveThreshold },
      })
    )
  );

  return resolved.count;
}

// ─── Resolve DEVICE_DOWN saat recovery (beserta child-nya) ───────────────────
export async function resolveDeviceDownAlert(
  prisma: PrismaClient,
  deviceId: string
): Promise<{ downResolved: number; childrenResolved: number }> {
  const correlationKey = correlationKeyFor(deviceId);

  const parents = await prisma.alert.findMany({
    where: {
      deviceId,
      type: 'DEVICE_DOWN',
      status: { in: OPEN_STATUSES },
      correlationKey,
    },
    select: { id: true },
  });
  const parentIds = parents.map((p) => p.id);

  const downResolved = await prisma.alert.updateMany({
    where: { id: { in: parentIds } },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });

  const childrenIds = await prisma.alert.findMany({
    where: {
      parentId: { in: parentIds },
      status: { in: OPEN_STATUSES },
    },
    select: { id: true },
  });

  const childrenResolved = await prisma.alert.updateMany({
    where: { id: { in: childrenIds.map((c) => c.id) } },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });

  await Promise.all(
    [...parentIds, ...childrenIds.map((c) => c.id)].map((id) =>
      recordAlertActivity(prisma, {
        alertId: id,
        action: 'RESOLVED',
        message: 'Device recovered — alert otomatis ditutup.',
        details: { autoResolved: true },
      })
    )
  );

  return { downResolved: downResolved.count, childrenResolved: childrenResolved.count };
}

// ─── ANOMALY_DETECTED: dedupe + auto-create alert for HIGH/CRITICAL ──────────
export async function processAnomalyAlert(
  prisma: PrismaClient,
  device: AlertDevice,
  anomaly: {
    id: string;
    metricType: string;
    anomalyScore: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }
): Promise<{ created: boolean; alert: { id: string; severity: AlertSeverity; message: string } | null }> {
  if (anomaly.severity !== 'HIGH' && anomaly.severity !== 'CRITICAL') {
    return { created: false, alert: null };
  }

  const dedupKey = dedupKeyAnomaly(device.id, anomaly.metricType);
  const correlationKey = correlationKeyFor(device.id);

  const message = `Anomaly detected on ${device.name} (${device.ip}): ${anomaly.metricType} ` +
    `with score ${anomaly.anomalyScore.toFixed(3)} (${anomaly.severity})`;

  const result = await createAlertIfNotDuplicate(prisma, {
    type: 'ANOMALY_DETECTED',
    deviceId: device.id,
    message,
    severity: anomaly.severity as AlertSeverity,
    dedupKey,
    correlationKey,
    valueSnapshot: { anomalyScore: anomaly.anomalyScore, metricType: anomaly.metricType },
  });

  return { created: result.created, alert: result.alert };
}

// ─── Resolve ANOMALY alerts when score drops ──────────────────────────────────
export async function resolveAnomalyAlert(
  prisma: PrismaClient,
  deviceId: string,
  metricType: string
): Promise<number> {
  const dedupKey = dedupKeyAnomaly(deviceId, metricType);

  const open = await prisma.alert.findMany({
    where: { dedupKey, status: { in: OPEN_STATUSES } },
    select: { id: true },
  });

  const resolved = await prisma.alert.updateMany({
    where: { id: { in: open.map((o) => o.id) } },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
    },
  });

  await Promise.all(
    open.map((o) =>
      recordAlertActivity(prisma, {
        alertId: o.id,
        action: 'RESOLVED',
        message: 'Skor anomali kembali normal — alert otomatis ditutup.',
        details: { autoResolved: true },
      })
    )
  );

  return resolved.count;
}

// ─── CUSTOM OID: alert saat nilai melewati alertHigh/alertLow (CustomOid) ─────
export interface CustomOidAlertInput {
  oid: string;
  name: string;
  value: number;
  unit: string | null;
  /** 'HIGH' = di atas alertHigh, 'LOW' = di bawah alertLow. */
  direction: 'HIGH' | 'LOW';
  alertHigh: number | null;
  alertLow: number | null;
}

/**
 * Buat / dedupe alert untuk custom OID yang breach threshold.
 * severity: HIGH untuk melebihi ambang atas, MEDIUM untuk ambang bawah.
 */
export async function processCustomOidAlert(
  prisma: PrismaClient,
  device: AlertDevice,
  input: CustomOidAlertInput & { minConsecutive?: number }
): Promise<{ created: boolean; alert: { id: string; severity: AlertSeverity; message: string } | null }> {
  const dedupKey = dedupKeyCustomOid(device.id, input.oid);
  const correlationKey = correlationKeyFor(device.id);

  const bound =
    input.direction === 'HIGH'
      ? (input.alertHigh ?? input.value)
      : (input.alertLow ?? input.value);

  const message =
    `Custom OID "${input.name}" on ${device.name} (${device.ip}) is ${input.value}` +
    `${input.unit ?? ''} (${input.direction === 'HIGH' ? '>' : '<'} threshold ${bound}${input.unit ?? ''}).`;

  // Anti-flapping: tunggu N sampel berturut-turut.
  const streak = bumpStreak(`custom:${device.id}:${input.oid}`, input.minConsecutive ?? DEFAULT_MIN_CONSECUTIVE);
  if (!streak.qualifies) {
    return { created: false, alert: null };
  }

  const result = await createAlertIfNotDuplicate(prisma, {
    type: 'CUSTOM_OID_OUT_OF_RANGE',
    deviceId: device.id,
    message,
    severity: input.direction === 'HIGH' ? 'HIGH' : 'MEDIUM',
    dedupKey,
    correlationKey,
    valueSnapshot: { oid: input.oid, name: input.name, value: input.value, direction: input.direction },
  });

  return { created: result.created, alert: result.alert };
}

/** Resolve custom OID alert ketika nilai kembali normal. */
export async function resolveCustomOidAlert(
  prisma: PrismaClient,
  deviceId: string,
  oid: string
): Promise<number> {
  // Pulih → reset streak anti-flapping.
  resetStreak(`custom:${deviceId}:${oid}`);

  const dedupKey = dedupKeyCustomOid(deviceId, oid);

  const open = await prisma.alert.findMany({
    where: { dedupKey, status: { in: OPEN_STATUSES } },
    select: { id: true },
  });

  const resolved = await prisma.alert.updateMany({
    where: { id: { in: open.map((o) => o.id) } },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });

  await Promise.all(
    open.map((o) =>
      recordAlertActivity(prisma, {
        alertId: o.id,
        action: 'RESOLVED',
        message: 'Nilai custom OID kembali dalam rentang normal.',
        details: { autoResolved: true },
      })
    )
  );

  return resolved.count;
}
