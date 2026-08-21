/**
 * Correlation Analysis Engine
 * Detects cross-metric correlations, root cause analysis, and dependency mapping.
 */

import prisma from '@/lib/prisma';
import { BASELINE_WINDOW_HOURS } from './constants';
import { Prisma } from '@prisma/client';

interface CorrelationResult {
  metricA: string;
  metricB: string;
  correlation: number; // -1 to 1
  pValue: number;
  sampleSize: number;
  interpretation: 'STRONG_POSITIVE' | 'POSITIVE' | 'WEAK' | 'NEGATIVE' | 'STRONG_NEGATIVE';
}

interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

interface CorrelationAnalysisOptions {
  deviceId?: string;
  metricPairs?: Array<[string, string]>;
  windowHours?: number;
  minSamples?: number;
}

export async function analyzeCorrelations(
  options: CorrelationAnalysisOptions = {}
): Promise<CorrelationResult[]> {
  const {
    deviceId,
    windowHours = BASELINE_WINDOW_HOURS,
    minSamples = 30,
  } = options;

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // Default metric pairs to analyze
  const defaultPairs: Array<[string, string]> = [
    ['cpu', 'mem'],
    ['cpu', 'latency'],
    ['mem', 'latency'],
    ['cpu', 'packetLoss'],
    ['mem', 'packetLoss'],
    ['latency', 'packetLoss'],
    ['inBps', 'outBps'],
    ['cpu', 'inBps'],
    ['mem', 'inBps'],
  ];

  const pairs = options.metricPairs ?? defaultPairs;
  const results: CorrelationResult[] = [];

  const devices = deviceId
    ? [{ id: deviceId }]
    : await prisma.device.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });

  for (const device of devices) {
    for (const [metricA, metricB] of pairs) {
      const correlation = await computeMetricCorrelation(
        device.id,
        metricA,
        metricB,
        since,
        minSamples
      );

      if (correlation) {
        results.push({
          ...correlation,
          metricA: `${device.id}:${metricA}`,
          metricB: `${device.id}:${metricB}`,
        });
      }
    }
  }

  return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

async function computeMetricCorrelation(
  deviceId: string,
  metricA: string,
  metricB: string,
  since: Date,
  minSamples: number
): Promise<Omit<CorrelationResult, 'metricA' | 'metricB'> | null> {
  const seriesA = await fetchMetricSeries(deviceId, metricA, since);
  const seriesB = await fetchMetricSeries(deviceId, metricB, since);

  if (!seriesA || !seriesB) return null;

  // Align timestamps (nearest neighbor within 60s)
  const aligned = alignSeries(seriesA, seriesB, 60_000);

  if (aligned.length < minSamples) return null;

  const { correlation, pValue } = pearsonCorrelation(
    aligned.map((p) => p.a),
    aligned.map((p) => p.b)
  );

  return {
    correlation,
    pValue,
    sampleSize: aligned.length,
    interpretation: interpretCorrelation(correlation),
  };
}

async function fetchMetricSeries(
  deviceId: string,
  metric: string,
  since: Date
): Promise<TimeSeriesPoint[] | null> {
  let metricType: string;
  let column: string;

  switch (metric) {
    case 'cpu':
      metricType = 'SNMP';
      column = 'cpuUtil';
      break;
    case 'mem':
      metricType = 'SNMP';
      column = 'memUtil';
      break;
    case 'latency':
      metricType = 'ICMP';
      column = 'latency';
      break;
    case 'packetLoss':
      metricType = 'ICMP';
      column = 'packetLoss';
      break;
    case 'inBps':
    case 'outBps':
      // Bandwidth needs special handling from interface data
      return fetchBandwidthSeries(deviceId, metric, since);
    default:
      return null;
  }

  const rows = await prisma.metric.findMany({
    where: {
      deviceId,
      metricType,
      timestamp: { gte: since },
    },
    select: { [column]: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
  });

  return rows
    .filter((r) => r[column] != null)
    .map((r) => ({
      timestamp: new Date(r.timestamp).getTime(),
      value: Number(r[column]),
    }));
}

async function fetchBandwidthSeries(
  deviceId: string,
  direction: 'inBps' | 'outBps',
  since: Date
): Promise<TimeSeriesPoint[] | null> {
  // Aggregate bandwidth across all interfaces
  const rows = await prisma.metric.findMany({
    where: {
      deviceId,
      metricType: 'SNMP',
      timestamp: { gte: since },
      interfaceData: { not: Prisma.JsonNull },
    },
    select: { interfaceData: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
  });

  return rows
    .map((r) => {
      const interfaces = Array.isArray(r.interfaceData)
        ? (r.interfaceData as unknown as Array<{ inBps: number; outBps: number }>)
        : [];
      const total = interfaces.reduce((sum, iface) => sum + (iface[direction] ?? 0), 0);
      return { timestamp: new Date(r.timestamp).getTime(), value: total };
    })
    .filter((p) => p.value > 0);
}

function alignSeries(
  seriesA: TimeSeriesPoint[],
  seriesB: TimeSeriesPoint[],
  maxGapMs: number
): Array<{ a: number; b: number }> {
  const aligned: Array<{ a: number; b: number }> = [];
  let j = 0;

  for (const pointA of seriesA) {
    // Find closest point in seriesB
    while (j < seriesB.length - 1 && seriesB[j + 1].timestamp < pointA.timestamp) {
      j++;
    }

    const pointB = seriesB[j];
    if (pointB && Math.abs(pointA.timestamp - pointB.timestamp) <= maxGapMs) {
      aligned.push({ a: pointA.value, b: pointB.value });
    }
  }

  return aligned;
}

function pearsonCorrelation(
  x: number[],
  y: number[]
): { correlation: number; pValue: number } {
  const n = x.length;
  if (n < 2) return { correlation: 0, pValue: 1 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denomX = n * sumX2 - sumX * sumX;
  const denomY = n * sumY2 - sumY * sumY;

  if (denomX <= 0 || denomY <= 0) return { correlation: 0, pValue: 1 };

  const r = numerator / Math.sqrt(denomX * denomY);

  // Clamp to [-1, 1]
  const correlation = Math.max(-1, Math.min(1, r));

  // Calculate p-value using t-distribution approximation
  // t = r * sqrt((n-2)/(1-r^2))
  const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
  const pValue = 2 * studentTCDF(-Math.abs(t), n - 2);

  return { correlation, pValue };
}

function studentTCDF(t: number, df: number): number {
  // Approximation for Student's t-distribution CDF
  if (df <= 0) return 0.5;

  const x = df / (t * t + df);
  const a = df / 2;
  const b = 0.5;

  // Incomplete beta function approximation
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );

  if (t < 0) return bt * betaInc(x, a, b) / a;
  return 1 - bt * betaInc(x, a, b) / a;
}

function logGamma(x: number): number {
  const coef = [76.18009173, -86.50532033, 24.01409822, -1.231739516, 0.00120858003, -0.00000536382];
  let y = x;
  let tmp = y + 5.5;
  tmp -= (y + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let i = 0; i < coef.length; i++) {
    y++;
    ser += coef[i] / y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betaInc(x: number, a: number, b: number): number {
  const eps = 1e-10;
  const maxIter = 200;

  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );

  if (x === 0 || x === 1) return bt;

  let sum = 1 / a;
  let term = 1 / a;

  for (let i = 1; i <= maxIter; i++) {
    term *= ((a + i - 1) * x) / (a + b + i);
    sum += term / (a + i);
    if (Math.abs(term) < eps) break;
  }

  return bt * sum;
}

function interpretCorrelation(r: number): CorrelationResult['interpretation'] {
  const absR = Math.abs(r);
  if (absR >= 0.8) return r > 0 ? 'STRONG_POSITIVE' : 'STRONG_NEGATIVE';
  if (absR >= 0.5) return r > 0 ? 'POSITIVE' : 'NEGATIVE';
  return 'WEAK';
}

/**
 * Root Cause Analysis - Given an alert, find correlated metrics that may indicate the cause
 */
export async function findRootCauseCandidates(
  deviceId: string,
  alertMetric: string,
  alertTimestamp: Date,
  windowHours = 2
): Promise<Array<{ metric: string; correlation: number; trend: 'UP' | 'DOWN' | 'STABLE' }>> {
  const since = new Date(alertTimestamp.getTime() - windowHours * 60 * 60 * 1000);

  const candidateMetrics = ['cpu', 'mem', 'latency', 'packetLoss', 'inBps', 'outBps'].filter(
    (m) => m !== alertMetric
  );

  const results = [];

  for (const metric of candidateMetrics) {
    const corr = await computeMetricCorrelation(deviceId, alertMetric, metric, since, 20);
    if (!corr) continue;

    // Check trend before alert
    const series = await fetchMetricSeries(deviceId, metric, since);
    if (series && series.length > 5) {
      const recent = series.slice(-5);
      const trend = detectTrend(recent.map((p) => p.value));
      results.push({ metric, correlation: corr.correlation, trend });
    }
  }

  return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

function detectTrend(values: number[]): 'UP' | 'DOWN' | 'STABLE' {
  if (values.length < 3) return 'STABLE';

  let up = 0;
  let down = 0;

  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) up++;
    else if (values[i] < values[i - 1]) down++;
  }

  if (up > down * 1.5) return 'UP';
  if (down > up * 1.5) return 'DOWN';
  return 'STABLE';
}

/**
 * Dependency Map - Build device relationship graph based on correlated failures
 */
export interface DependencyEdge {
  source: string;
  target: string;
  weight: number;
  type: 'CORRELATION' | 'CASCADE';
}

export async function buildDependencyMap(
  windowHours = 24
): Promise<{ nodes: string[]; edges: DependencyEdge[] }> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // Get all devices that had alerts in the window
  const alerts = await prisma.alert.findMany({
    where: {
      status: 'ACTIVE',
      createdAt: { gte: since },
      deviceId: { not: null },
    },
    select: { deviceId: true, createdAt: true, type: true },
  });

  const deviceAlerts = new Map<string, Date[]>();
  for (const alert of alerts) {
    if (!alert.deviceId) continue;
    const arr = deviceAlerts.get(alert.deviceId) ?? [];
    arr.push(alert.createdAt);
    deviceAlerts.set(alert.deviceId, arr);
  }

  const devices = Array.from(deviceAlerts.keys());
  const edges: DependencyEdge[] = [];

  // Detect cascading alerts (device A alert followed by device B alert within short window)
  for (let i = 0; i < alerts.length; i++) {
    for (let j = i + 1; j < alerts.length; j++) {
      const a = alerts[i];
      const b = alerts[j];

      if (!a.deviceId || !b.deviceId || a.deviceId === b.deviceId) continue;

      const timeDiff = Math.abs(a.createdAt.getTime() - b.createdAt.getTime());
      if (timeDiff <= 10 * 60 * 1000) { // 10 minute window
        edges.push({
          source: a.deviceId,
          target: b.deviceId,
          weight: 1 - timeDiff / (10 * 60 * 1000),
          type: 'CASCADE',
        });
      }
    }
  }

  // Add correlation edges from correlation analysis
  const correlations = await analyzeCorrelations({ windowHours });
  for (const corr of correlations) {
    if (corr.correlation > 0.7 && corr.pValue < 0.05) {
      const [src] = corr.metricA.split(':');
      const [tgt] = corr.metricB.split(':');
      if (src !== tgt) {
        edges.push({
          source: src,
          target: tgt,
          weight: Math.abs(corr.correlation),
          type: 'CORRELATION',
        });
      }
    }
  }

  return { nodes: devices, edges };
}