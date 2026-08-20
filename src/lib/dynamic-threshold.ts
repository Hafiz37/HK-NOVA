/**
 * Dynamic Threshold Engine
 *
 * Menghitung threshold ICMP/SNMP secara otomatis berdasarkan data historis
 * per device menggunakan pendekatan statistik (mean + N×stddev).
 *
 * Algoritma:
 *  - Ambil N data poin terbaru (window historis) dari tabel Metric
 *  - Hitung mean dan stddev
 *  - dynamicHigh = mean + SIGMA_HIGH × stddev   (batas atas alert)
 *  - Simpan/update ke tabel DeviceThreshold
 *
 * Fitur:
 *  - Support metric: latency, packetLoss, jitter, cpu, mem
 *  - Override manual: jika manualHigh diset, nilai itu yang digunakan alert
 *  - Recompute hanya jika ada data baru (sampleCount berubah)
 *  - Dapat dipanggil dari worker atau API route
 */

import { PrismaClient } from '@prisma/client';
import { computeBaseline } from './baseline';

// ─── Constants ────────────────────────────────────────────────────────────────
// Sigma multiplier untuk threshold dinamis
// HIGH: mean + 3σ → hampir tidak pernah normal, tapi bisa alert
// WARNING: mean + 2σ → lebih sensitif
export const DYNAMIC_THRESHOLD_SIGMA_HIGH = Number(process.env.DYNAMIC_THRESHOLD_SIGMA_HIGH ?? '3');
export const DYNAMIC_THRESHOLD_SIGMA_WARN = Number(process.env.DYNAMIC_THRESHOLD_SIGMA_WARN ?? '2');

// Window historis untuk komputasi threshold (jam)
export const DYNAMIC_THRESHOLD_WINDOW_HOURS = Number(process.env.DYNAMIC_THRESHOLD_WINDOW_HOURS ?? '168'); // 7 hari

// Minimum sampel sebelum threshold dinamis aktif
export const DYNAMIC_THRESHOLD_MIN_SAMPLES = Number(process.env.DYNAMIC_THRESHOLD_MIN_SAMPLES ?? '30');

// ─── Types ────────────────────────────────────────────────────────────────────
export type ThresholdMetric = 'latency' | 'packetLoss' | 'jitter' | 'cpu' | 'mem';

export interface ThresholdResult {
  metric: ThresholdMetric;
  /** Threshold aktif — manualHigh jika diset, else dynamicHigh */
  effectiveHigh: number | null;
  effectiveLow: number | null;
  dynamicHigh: number | null;
  dynamicLow: number | null;
  manualHigh: number | null;
  manualLow: number | null;
  baselineMean: number | null;
  baselineStddev: number | null;
  sampleCount: number;
  computedAt: Date;
  insufficientData: boolean;
}

// ─── Map metric name ke kolom Prisma ─────────────────────────────────────────
function metricToColumn(metric: ThresholdMetric): { column: string; metricType: string } {
  switch (metric) {
    case 'latency':    return { column: 'latency',    metricType: 'ICMP' };
    case 'packetLoss': return { column: 'packetLoss', metricType: 'ICMP' };
    case 'jitter':     return { column: 'jitter',     metricType: 'ICMP' };
    case 'cpu':        return { column: 'cpuUtil',    metricType: 'SNMP' };
    case 'mem':        return { column: 'memUtil',    metricType: 'SNMP' };
  }
}

// ─── Komputasi & simpan threshold dinamis ─────────────────────────────────────
export async function computeAndSaveDynamicThreshold(
  prisma: PrismaClient,
  deviceId: string,
  metric: ThresholdMetric,
  windowHours: number = DYNAMIC_THRESHOLD_WINDOW_HOURS,
  sigmaHigh: number = DYNAMIC_THRESHOLD_SIGMA_HIGH
): Promise<ThresholdResult> {
  const { column, metricType } = metricToColumn(metric);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // Ambil data historis
  const rows = await prisma.metric.findMany({
    where: {
      deviceId,
      metricType,
      timestamp: { gte: since },
      [column]: { not: null },
    },
    select: { [column]: true },
    orderBy: { timestamp: 'asc' },
  });

  const values = rows
    .map((r: Record<string, unknown>) => Number(r[column]))
    .filter((v: number) => !isNaN(v) && v >= 0);

  const stats = computeBaseline(values);
  const insufficientData = stats.count < DYNAMIC_THRESHOLD_MIN_SAMPLES;

  let dynamicHigh: number | null = null;
  let dynamicLow: number | null = null;

  if (!insufficientData && stats.stddev > 0) {
    dynamicHigh = stats.mean + sigmaHigh * stats.stddev;
    // Lower bound hanya untuk metrik yang bisa rendah-anomali (latency, jitter)
    if (metric === 'latency' || metric === 'jitter') {
      dynamicLow = Math.max(0, stats.mean - sigmaHigh * stats.stddev);
    }
  } else if (!insufficientData && stats.stddev === 0) {
    // Semua nilai sama — gunakan mean + 20% sebagai fallback
    dynamicHigh = stats.mean * 1.2;
  }

  // Simpan / update ke DB
  const saved = await prisma.deviceThreshold.upsert({
    where: { deviceId_metric: { deviceId, metric } },
    create: {
      deviceId,
      metric,
      dynamicHigh,
      dynamicLow,
      baselineMean: stats.count > 0 ? stats.mean : null,
      baselineStddev: stats.count > 0 ? stats.stddev : null,
      sampleCount: stats.count,
      computedAt: new Date(),
    },
    update: {
      dynamicHigh,
      dynamicLow,
      baselineMean: stats.count > 0 ? stats.mean : null,
      baselineStddev: stats.count > 0 ? stats.stddev : null,
      sampleCount: stats.count,
      computedAt: new Date(),
    },
  });

  // Effective threshold: manual override lebih diprioritaskan
  const effectiveHigh = saved.manualHigh ?? dynamicHigh;
  const effectiveLow = saved.manualLow ?? dynamicLow;

  return {
    metric,
    effectiveHigh,
    effectiveLow,
    dynamicHigh,
    dynamicLow,
    manualHigh: saved.manualHigh,
    manualLow: saved.manualLow,
    baselineMean: saved.baselineMean,
    baselineStddev: saved.baselineStddev,
    sampleCount: saved.sampleCount,
    computedAt: saved.computedAt,
    insufficientData,
  };
}

/**
 * Baca threshold efektif saat ini tanpa recompute.
 * Digunakan oleh worker pada setiap poll cycle untuk efisiensi.
 */
export async function getEffectiveThreshold(
  prisma: PrismaClient,
  deviceId: string,
  metric: ThresholdMetric
): Promise<{ high: number | null; low: number | null; isDynamic: boolean }> {
  const record = await prisma.deviceThreshold.findUnique({
    where: { deviceId_metric: { deviceId, metric } },
    select: {
      dynamicHigh: true,
      dynamicLow: true,
      manualHigh: true,
      manualLow: true,
    },
  });

  if (!record) return { high: null, low: null, isDynamic: false };

  const high = record.manualHigh ?? record.dynamicHigh;
  const low = record.manualLow ?? record.dynamicLow;
  const isDynamic = record.manualHigh === null && record.dynamicHigh !== null;

  return { high, low, isDynamic };
}

/**
 * Batch: hitung & simpan threshold untuk semua metrik satu device.
 */
export async function recomputeAllThresholds(
  prisma: PrismaClient,
  deviceId: string,
  metrics: ThresholdMetric[] = ['latency', 'packetLoss', 'jitter', 'cpu', 'mem']
): Promise<Record<ThresholdMetric, ThresholdResult>> {
  const results = await Promise.all(
    metrics.map(async (m) => {
      const r = await computeAndSaveDynamicThreshold(prisma, deviceId, m);
      return [m, r] as const;
    })
  );
  return Object.fromEntries(results) as Record<ThresholdMetric, ThresholdResult>;
}
