import { PrismaClient } from '@prisma/client';
import {
  BASELINE_WINDOW_HOURS,
  BASELINE_MIN_SAMPLES,
  BASELINE_WARN_SIGMA,
  BASELINE_CRIT_SIGMA,
} from './constants';

/**
 * Historical Baseline — menghitung statistik dasar (window historis) per
 * device per metrik, dan mengukur penyimpangan nilai terkini (z-score).
 */

export type BaselineField = 'latency' | 'packetLoss' | 'cpu' | 'mem';

export interface BaselineStats {
  mean: number;
  stddev: number;
  min: number;
  max: number;
  p95: number;
  count: number;
}

export type DeviationLevel = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'INSUFFICIENT_DATA';

export interface BaselineResult {
  baseline: BaselineStats;
  insufficientData: boolean;
}

// ─── Pure statistics ──────────────────────────────────────────────────────────
export function computeBaseline(values: number[]): BaselineStats {
  const count = values.length;
  if (count === 0) {
    return { mean: 0, stddev: 0, min: 0, max: 0, p95: 0, count: 0 };
  }

  const mean = values.reduce((s, v) => s + v, 0) / count;
  const variance =
    count > 1
      ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (count - 1)
      : 0;
  const stddev = Math.sqrt(variance);

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[count - 1];
  const p95 = sorted[Math.min(count - 1, Math.ceil(count * 0.95) - 1)];

  return { mean, stddev, min, max, p95, count };
}

// ─── Deviation (z-score) ──────────────────────────────────────────────────────
export function deviationScore(value: number, baseline: BaselineStats): number {
  if (baseline.count === 0 || baseline.stddev === 0) {
    return value === baseline.mean ? 0 : Number.POSITIVE_INFINITY;
  }
  return (value - baseline.mean) / baseline.stddev;
}

export function classifyDeviation(
  value: number,
  baseline: BaselineStats,
  warnSigma: number = BASELINE_WARN_SIGMA,
  critSigma: number = BASELINE_CRIT_SIGMA
): DeviationLevel {
  if (baseline.count < BASELINE_MIN_SAMPLES) {
    return 'INSUFFICIENT_DATA';
  }
  const z = Math.abs(deviationScore(value, baseline));
  if (z >= critSigma) return 'CRITICAL';
  if (z >= warnSigma) return 'WARNING';
  return 'NORMAL';
}

// ─── DB-backed builder ────────────────────────────────────────────────────────
export async function buildBaseline(
  prisma: PrismaClient,
  input: {
    deviceId: string;
    field: BaselineField;
    windowHours?: number;
  }
): Promise<BaselineResult> {
  const { deviceId, field, windowHours = BASELINE_WINDOW_HOURS } = input;
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // ICMP fields vs SNMP fields
  const metricType = field === 'latency' || field === 'packetLoss' ? 'ICMP' : 'SNMP';
  const column = field === 'latency' ? 'latency'
    : field === 'packetLoss' ? 'packetLoss'
    : field === 'cpu' ? 'cpuUtil'
    : 'memUtil';

  const rows = await prisma.metric.findMany({
    where: {
      deviceId,
      metricType,
      timestamp: { gte: since },
    },
    select: { [column]: true },
  });

  const values = rows
    .filter((r) => r[column] != null)
    .map((r) => Number(r[column]))
    .filter((v) => typeof v === 'number' && !Number.isNaN(v));

  const stats = computeBaseline(values);
  const insufficientData = stats.count < BASELINE_MIN_SAMPLES;

  return { baseline: stats, insufficientData };
}

// ─── Latest value helper ──────────────────────────────────────────────────────
export async function getLatestValue(
  prisma: PrismaClient,
  input: { deviceId: string; field: BaselineField }
): Promise<number | null> {
  const { deviceId, field } = input;
  const metricType = field === 'latency' || field === 'packetLoss' ? 'ICMP' : 'SNMP';
  const column = field === 'latency' ? 'latency'
    : field === 'packetLoss' ? 'packetLoss'
    : field === 'cpu' ? 'cpuUtil'
    : 'memUtil';

  const row = await prisma.metric.findFirst({
    where: {
      deviceId,
      metricType,
      [column]: { not: null },
    },
    orderBy: { timestamp: 'desc' },
    select: { [column]: true, timestamp: true },
  });

  if (!row) return null;
  const v = Number(row[column]);
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}
