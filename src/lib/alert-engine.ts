import {
  PrismaClient,
  AlertStatus,
  AlertSeverity,
  AlertType,
} from '@prisma/client';

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
  }
): Promise<{ created: boolean; alert: { id: string; severity: AlertSeverity; message: string } }> {
  if (input.dedupKey) {
    const existing = await findOpenByDedupKey(prisma, input.dedupKey);
    if (existing) {
      return { created: false, alert: existing };
    }
  }

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
    },
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
      await prisma.alert.create({
        data: {
          type: 'HIGH_UTILIZATION',
          deviceId: device.id,
          message,
          severity,
          status: 'RESOLVED',
          resolvedAt: new Date(),
          dedupKey,
          correlationKey,
          parentId: down.id,
        },
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
    },
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
  const resolved = await prisma.alert.updateMany({
    where: {
      dedupKey,
      status: { in: OPEN_STATUSES },
    },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });
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

  const childrenResolved = await prisma.alert.updateMany({
    where: {
      parentId: { in: parentIds },
      status: { in: OPEN_STATUSES },
    },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });

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

  const resolved = await prisma.alert.updateMany({
    where: {
      dedupKey,
      status: { in: OPEN_STATUSES },
    },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
    },
  });

  return resolved.count;
}
