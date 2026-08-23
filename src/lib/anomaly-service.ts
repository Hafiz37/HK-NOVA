import { PrismaClient, AnomalySeverity, Anomaly } from '@prisma/client';
import {
  ANOMALY_TRAINING_DAYS,
  ANOMALY_MIN_SAMPLES,
  ANOMALY_SCORE_THRESHOLD_HIGH,
  ANOMALY_SCORE_THRESHOLD_CRITICAL,
} from './constants';
import { loadActiveModelFromDb, saveModelToDb } from './model-persistence';
import { extractAdvancedFeatures } from './feature-engineering';
import { getDeviceTypeConfig } from './device-model-config';
import { EnsembleEngine, createEnsembleEngine, type EnsembleResult, type FeatureContribution } from './algorithms';

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

export interface EnsemblePrediction {
  result: EnsembleResult;
  featureNames: string[];
}

function normalizeFeatures(
  data: number[][],
  existingStats?: { mean: number[]; std: number[] }
): { normalized: number[][]; stats: { mean: number[]; std: number[] } } {
  if (data.length === 0) {
    return { normalized: [], stats: { mean: [], std: [] } };
  }

  const numFeatures = data[0].length;

  if (existingStats) {
    const normalized = data.map((row) =>
      row.map((val, i) => {
        if (val == null || isNaN(val)) return 0;
        const m = existingStats.mean[i] ?? 0;
        const s = existingStats.std[i] ?? 1;
        return s > 0 ? (val - m) / s : 0;
      })
    );
    return { normalized, stats: existingStats };
  }

  const mean: number[] = [];
  const std: number[] = [];

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

export async function trainModel(
  prisma: PrismaClient,
  deviceId: string
): Promise<TrainedModel | null> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { type: true },
  });

  const config = getDeviceTypeConfig(device?.type);
  const { vectors, featureNames } = await extractAdvancedFeatures(prisma, deviceId, config.trainingDays || ANOMALY_TRAINING_DAYS);

  const minSamples = config.minSamples || ANOMALY_MIN_SAMPLES;
  if (vectors.length < minSamples) {
    console.warn(
      `[Anomaly Service] Device ${deviceId}: insufficient samples (${vectors.length} < ${minSamples})`
    );
    return null;
  }

  const rawData = vectors.map((v) => v.features);
  const { normalized, stats } = normalizeFeatures(rawData);

  const dataObjects = normalized.map((row) => {
    const obj: Record<string, number> = {};
    featureNames.forEach((name, i) => {
      obj[name] = row[i];
    });
    return obj;
  });

  try {
    const startTime = Date.now();
    const forest = new IsolationForest(config.nTrees, config.maxSamples);
    forest.fit(dataObjects);

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

    const trainedModel: TrainedModel = {
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

    // Save to Database (Model Persistence)
    await saveModelToDb(prisma, trainedModel, {
      deviceType: device?.type || 'UNKNOWN',
      hyperParams: {
        nTrees: config.nTrees,
        maxSamples: config.maxSamples,
        contamination: config.contamination,
      },
      performance: {
        samplesUsed: vectors.length,
        featureCount: featureNames.length,
        avgScore: mean,
        maxScore: trainScores[trainScores.length - 1] ?? 0,
        minScore: trainScores[0] ?? 0,
        trainingTimeMs: Date.now() - startTime,
      },
    });

    return trainedModel;
  } catch (err) {
    console.error(`[Anomaly Service] Training failed for device ${deviceId}:`, err);
    return null;
  }
}

export async function getOrTrainModel(
  prisma: PrismaClient,
  deviceId: string,
  maxAgeHours = 24
): Promise<TrainedModel | null> {
  // 1. Try loading active model from DB
  const persisted = await loadActiveModelFromDb(prisma, deviceId);
  if (persisted) {
    const ageHours = (Date.now() - persisted.trainedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < maxAgeHours) {
      return persisted;
    }
  }

  // 2. Train new model & auto-persist to DB
  return trainModel(prisma, deviceId);
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

export function classifySeverity(score: number, model?: TrainedModel | null): AnomalySeverity {
  if (model?.scoreStats) {
    const { p90, p95, p99 } = model.scoreStats;
    if (score >= p99) return 'CRITICAL';
    if (score >= p95) return 'HIGH';
    if (score >= p90) return 'MEDIUM';
    return 'LOW';
  }

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
  deviceId: string
): Promise<{ features: number[]; metricType: string; timestamp: Date } | null> {
  const { vectors } = await extractAdvancedFeatures(prisma, deviceId, 1);
  if (vectors.length === 0) return null;

  const latestVector = vectors[vectors.length - 1];

  // Map metricType from base features
  let metricType = 'combined';
  if (latestVector.features[1] > 0) metricType = 'cpu'; // cpu
  else if (latestVector.features[2] > 0) metricType = 'memory'; // memory
  else if (latestVector.features[0] > 0) metricType = 'latency'; // latency

  return {
    features: latestVector.features,
    metricType,
    timestamp: latestVector.timestamp,
  };
}

export async function trainEnsembleModels(
  prisma: PrismaClient,
  deviceId: string
): Promise<{ ensemble: EnsembleEngine; trainData: number[][]; featureNames: string[] } | null> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { type: true },
  });

  const config = getDeviceTypeConfig(device?.type);
  const { vectors, featureNames } = await extractAdvancedFeatures(prisma, deviceId, config.trainingDays || ANOMALY_TRAINING_DAYS);

  const minSamples = config.minSamples || ANOMALY_MIN_SAMPLES;
  if (vectors.length < minSamples) {
    console.warn(
      `[Anomaly Service] Device ${deviceId}: insufficient samples for ensemble (${vectors.length} < ${minSamples})`
    );
    return null;
  }

  const trainData = vectors.map((v) => v.features);

  // Train Isolation Forest
  const iforestModel = await trainModel(prisma, deviceId);

  // Create and train ensemble
  const ensemble = createEnsembleEngine();
  await ensemble.train(deviceId, trainData, featureNames, iforestModel ?? undefined);

  return { ensemble, trainData, featureNames };
}

export async function predictWithEnsemble(
  ensemble: EnsembleEngine,
  features: number[]
): Promise<EnsemblePrediction> {
  const result = ensemble.predict(features);
  const model = ensemble.getModels();
  return {
    result,
    featureNames: model.isolationForest?.featureNames ?? [],
  };
}

export function formatExplanation(result: EnsembleResult): {
  summary: string;
  topContributors: FeatureContribution[];
  recommendation: string;
} {
  const contributors = result.explanation ?? [];
  const topFeatures = contributors.slice(0, 3);

  const summary = topFeatures.length > 0
    ? `Anomaly driven by ${topFeatures.map((f) => f.featureName).join(', ')}`
    : 'Anomaly detected by ensemble';

  const recommendation = topFeatures.length > 0
    ? `Investigate ${topFeatures[0].featureName} (${topFeatures[0].severity} deviation: ${topFeatures[0].deviation.toFixed(1)}σ)`
    : 'Review device metrics and system health';

  return { summary, topContributors: topFeatures, recommendation };
}

export { EnsembleEngine, createEnsembleEngine, extractAdvancedFeatures };
