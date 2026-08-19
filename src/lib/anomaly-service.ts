import { PrismaClient, AnomalySeverity, Anomaly } from '@prisma/client';
import {
  ANOMALY_TRAINING_DAYS,
  ANOMALY_MIN_SAMPLES,
  ANOMALY_SCORE_THRESHOLD_HIGH,
  ANOMALY_SCORE_THRESHOLD_CRITICAL,
} from './constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const isoForestModule = require('isolation-forest');
const IsolationForest = isoForestModule.IsolationForest ?? isoForestModule;

export interface FeatureVector {
  timestamp: Date;
  features: number[];
}

export interface TrainedModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forest: any;
  trainedAt: Date;
  deviceId: string;
  featureNames: string[];
  stats: {
    mean: number[];
    std: number[];
  };
  /** Distribusi skor anomali dari data training untuk kalibrasi relatif. */
  scoreStats: {
    mean: number;
    std: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

export interface AnomalyScore {
  score: number;
  severity: AnomalySeverity;
  metricType: string;
  timestamp: Date;
}

async function getMetricsForTraining(
  prisma: PrismaClient,
  deviceId: string,
  days: number = ANOMALY_TRAINING_DAYS
) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const metrics = await prisma.metric.findMany({
    where: {
      deviceId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: 'asc' },
  });

  return metrics;
}

function normalizeFeatures(
  data: number[][],
  existingStats?: { mean: number[]; std: number[] }
): { normalized: number[][]; stats: { mean: number[]; std: number[] } } {
  if (data.length === 0) {
    return { normalized: [], stats: { mean: [], std: [] } };
  }

  const numFeatures = data[0].length;
  const mean: number[] = [];
  const std: number[] = [];

  if (existingStats) {
    for (let i = 0; i < numFeatures; i++) {
      const normalized = data.map((row) => {
        const val = row[i];
        if (val == null || isNaN(val)) return 0;
        const m = existingStats.mean[i] ?? 0;
        const s = existingStats.std[i] ?? 1;
        return s > 0 ? (val - m) / s : 0;
      });
      data.forEach((row, idx) => (row[i] = normalized[idx]));
    }
    return { normalized: data, stats: existingStats };
  }

  for (let i = 0; i < numFeatures; i++) {
    const values = data.map((row) => row[i]).filter((v) => v != null && !isNaN(v));
    if (values.length === 0) {
      mean.push(0);
      std.push(1);
      continue;
    }

    const m = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / values.length;
    const s = Math.sqrt(variance);

    mean.push(m);
    std.push(s > 0 ? s : 1);
  }

  const normalized = data.map((row) =>
    row.map((val, i) => {
      if (val == null || isNaN(val)) return 0;
      return std[i] > 0 ? (val - mean[i]) / std[i] : 0;
    })
  );

  return { normalized, stats: { mean, std } };
}

export async function extractFeatures(
  prisma: PrismaClient,
  deviceId: string,
  days: number = ANOMALY_TRAINING_DAYS
): Promise<{ vectors: FeatureVector[]; featureNames: string[] }> {
  const metrics = await getMetricsForTraining(prisma, deviceId, days);

  if (metrics.length === 0) {
    return { vectors: [], featureNames: [] };
  }

  const featureNames = ['latency', 'cpu', 'memory', 'ifInOctets', 'ifOutOctets'];

  // Gabungkan metric ICMP & SNMP dalam bucket 5 menit agar tiap vektor punya
  // sinyal lengkap (latency + cpu + mem), bukan row terpisah yang penuh nol.
  const BUCKET_MS = 5 * 60 * 1000;
  const grouped = new Map<string, {
    timestamp: Date;
    latency: number | null;
    cpu: number | null;
    memory: number | null;
    ifInOctets: number | null;
    ifOutOctets: number | null;
  }>();
  for (const m of metrics) {
    const bucketStart = new Date(Math.floor(m.timestamp.getTime() / BUCKET_MS) * BUCKET_MS);
    const key = bucketStart.toISOString();
    if (!grouped.has(key)) {
      grouped.set(key, { timestamp: bucketStart, latency: null, cpu: null, memory: null, ifInOctets: null, ifOutOctets: null });
    }
    const entry = grouped.get(key)!;
    const mt = m.metricType?.toLowerCase();
    if (mt === 'icmp' && m.latency != null && entry.latency == null) entry.latency = m.latency;
    if (mt === 'snmp') {
      if (m.cpuUtil != null) entry.cpu = m.cpuUtil;
      if (m.memUtil != null) entry.memory = m.memUtil;
      const ifaces = Array.isArray(m.interfaceData) ? m.interfaceData : [];
      const inOctets = (ifaces as Array<{ inOctets?: number }>)
        .map((i) => i.inOctets)
        .filter((v): v is number => typeof v === 'number');
      const outOctets = (ifaces as Array<{ outOctets?: number }>)
        .map((i) => i.outOctets)
        .filter((v): v is number => typeof v === 'number');
      if (inOctets.length > 0) entry.ifInOctets = inOctets.reduce((a, b) => a + b, 0);
      if (outOctets.length > 0) entry.ifOutOctets = outOctets.reduce((a, b) => a + b, 0);
    }
  }

  const vectors: FeatureVector[] = Array.from(grouped.values())
    .filter((entry) => {
      return entry.latency != null || entry.cpu != null || entry.memory != null;
    })
    .map((entry) => ({
      timestamp: entry.timestamp,
      features: [
        entry.latency ?? 0,
        entry.cpu ?? 0,
        entry.memory ?? 0,
        entry.ifInOctets ?? 0,
        entry.ifOutOctets ?? 0,
      ],
    }));

  return { vectors, featureNames };
}

export async function trainModel(
  prisma: PrismaClient,
  deviceId: string
): Promise<TrainedModel | null> {
  const { vectors, featureNames } = await extractFeatures(prisma, deviceId);

  if (vectors.length < ANOMALY_MIN_SAMPLES) {
    console.warn(
      `[Anomaly Service] Device ${deviceId}: insufficient samples (${vectors.length} < ${ANOMALY_MIN_SAMPLES})`
    );
    return null;
  }

  const rawData = vectors.map((v) => v.features);
  const { normalized, stats } = normalizeFeatures(rawData);

  // isolation-forest@0.0.9 expects an array of DataObjects ({ [key]: number }),
  // not flat arrays. Convert normalized feature rows into labeled objects.
  const dataObjects = normalized.map((row) => {
    const obj: Record<string, number> = {};
    featureNames.forEach((name, i) => {
      obj[name] = row[i];
    });
    return obj;
  });

  try {
    const forest = new IsolationForest(100, 256);

    forest.fit(dataObjects);

    // Kalibrasi relatif: distribusi skor data training dipakai sebagai acuan
    // klasifikasi severity. Library isolation-forest menghasilkan skor absolut
    // yang terkompresi (~0.3-0.6), sehingga threshold absolut tidak andal.
    const trainScores = (forest.scores() as number[])
      .map((s) => Math.max(0, Math.min(1, s)))
      .sort((a, b) => a - b);

    const mean = trainScores.reduce((a, b) => a + b, 0) / trainScores.length;
    const variance =
      trainScores.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / trainScores.length;
    const std = Math.sqrt(variance);
    const percentile = (p: number): number => {
      if (trainScores.length === 0) return 1;
      const idx = Math.min(trainScores.length - 1, Math.floor((p / 100) * trainScores.length));
      return trainScores[idx];
    };

    return {
      forest,
      trainedAt: new Date(),
      deviceId,
      featureNames,
      stats,
      scoreStats: {
        mean,
        std: std > 0 ? std : 1,
        p90: percentile(90),
        p95: percentile(95),
        p99: percentile(99),
      },
    };
  } catch (err) {
    console.error(`[Anomaly Service] Training failed for device ${deviceId}:`, err);
    return null;
  }
}

export function scoreMetric(model: TrainedModel, features: number[]): number {
  try {
    const { normalized } = normalizeFeatures([features], model.stats);
    const dataObject: Record<string, number> = {};
    model.featureNames.forEach((name, i) => {
      dataObject[name] = normalized[0][i];
    });

    const scores = model.forest.predict([dataObject]);
    const score = Array.isArray(scores) && scores.length > 0 ? scores[0] : 0;
    return Math.max(0, Math.min(1, score));
  } catch (err) {
    console.error('[Anomaly Service] Scoring failed:', err);
    return 0;
  }
}

/**
 * Klasifikasi severity relatif terhadap distribusi skor training.
 * Skor di atas p90/p95/p99 training → MEDIUM/HIGH/CRITICAL.
 */
export function classifySeverity(score: number, model?: TrainedModel | null): AnomalySeverity {
  if (model?.scoreStats) {
    const { p90, p95, p99 } = model.scoreStats;
    if (score >= p99) return 'CRITICAL';
    if (score >= p95) return 'HIGH';
    if (score >= p90) return 'MEDIUM';
    return 'LOW';
  }

  // Fallback brutal (tanpa model): threshold absolut agar tetap ada sinyal.
  if (score >= ANOMALY_SCORE_THRESHOLD_CRITICAL) return 'CRITICAL';
  if (score >= ANOMALY_SCORE_THRESHOLD_HIGH) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  return 'LOW';
}

export async function saveAnomaly(
  prisma: PrismaClient,
  deviceId: string,
  metricType: string,
  score: number,
  severity: AnomalySeverity,
  timestamp?: Date
): Promise<Anomaly> {
  return prisma.anomaly.create({
    data: {
      deviceId,
      metricType,
      anomalyScore: score,
      severity,
      timestamp: timestamp ?? new Date(),
    },
  });
}

export async function extractLatestFeatures(
  prisma: PrismaClient,
  deviceId: string,
  sinceMinutes: number = 5
): Promise<{ features: number[]; metricType: string; timestamp: Date } | null> {
  const since = new Date();
  since.setMinutes(since.getMinutes() - sinceMinutes);

  const metrics = await prisma.metric.findMany({
    where: {
      deviceId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });

  if (metrics.length === 0) return null;

  const latest = metrics[0];
  let metricType = 'combined';

  // interfaceData disimpan sebagai array of interfaces pada format db (json).
  const ifaces = Array.isArray(latest.interfaceData) ? latest.interfaceData : [];
  const inOctetsRaw = (ifaces as Array<{ inOctets?: number }>)
    .map((i) => i.inOctets)
    .filter((v): v is number => typeof v === 'number');
  const outOctetsRaw = (ifaces as Array<{ outOctets?: number }>)
    .map((i) => i.outOctets)
    .filter((v): v is number => typeof v === 'number');

  const features = [
    latest.latency ?? 0,
    latest.cpuUtil ?? 0,
    latest.memUtil ?? 0,
    inOctetsRaw.length > 0 ? inOctetsRaw.reduce((a, b) => a + b, 0) : 0,
    outOctetsRaw.length > 0 ? outOctetsRaw.reduce((a, b) => a + b, 0) : 0,
  ];

  if (latest.cpuUtil != null && latest.cpuUtil > 0) metricType = 'cpu';
  else if (latest.memUtil != null && latest.memUtil > 0) metricType = 'memory';
  else if (latest.latency != null) metricType = 'latency';

  return { features, metricType, timestamp: latest.timestamp };
}
