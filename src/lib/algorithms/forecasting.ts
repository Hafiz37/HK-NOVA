/**
 * Anomaly Risk Forecasting
 * Predicts probability of anomaly in next N minutes using gradient boosting
 */

import * as tf from '@tensorflow/tfjs-node';
import { PrismaClient } from '@prisma/client';
import { StatisticalModel, buildStatisticalModel } from './statistical';

export interface ForecastConfig {
  horizonMinutes: number;      // Prediction horizon (default: 60)
  lookbackWindows: number[];   // Historical windows to use as features (default: [5, 15, 30, 60])
  featureCount: number;        // Number of top features to use
  epochs: number;              // Training epochs
  batchSize: number;
  learningRate: number;
  validationSplit: number;
  threshold: number;           // Classification threshold (default: 0.5)
}

export interface ForecastModel {
  model: tf.LayersModel | null;
  config: ForecastConfig;
  featureNames: string[];
  scaler: StatisticalModel;
  isTrained: boolean;
  lastTrained?: Date;
  performance?: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    auc: number;
  };
}

export interface RiskPrediction {
  deviceId: string;
  timestamp: Date;
  riskScore: number;           // 0-1 probability of anomaly in next horizon
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  horizonMinutes: number;
  contributingFactors: Array<{
    feature: string;
    value: number;
    importance: number;
  }>;
  recommendedActions: string[];
}

const DEFAULT_FORECAST_CONFIG: ForecastConfig = {
  horizonMinutes: 60,
  lookbackWindows: [5, 15, 30, 60],  // minutes
  featureCount: 20,
  epochs: 50,
  batchSize: 64,
  learningRate: 0.001,
  validationSplit: 0.2,
  threshold: 0.5,
};

export function createForecastModel(config: Partial<ForecastConfig> = {}): ForecastModel {
  return {
    model: null,
    config: { ...DEFAULT_FORECAST_CONFIG, ...config },
    featureNames: [],
    scaler: buildStatisticalModel([]),
    isTrained: false,
  };
}

function buildForecastModel(inputDim: number, config: ForecastConfig): tf.LayersModel {
  const model = tf.sequential();

  // Input layer
  model.add(tf.layers.dense({
    units: 128,
    activation: 'relu',
    inputShape: [inputDim],
    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
  }));
  model.add(tf.layers.dropout({ rate: 0.3 }));

  // Hidden layers
  model.add(tf.layers.dense({
    units: 64,
    activation: 'relu',
    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
  }));
  model.add(tf.layers.dropout({ rate: 0.3 }));

  model.add(tf.layers.dense({
    units: 32,
    activation: 'relu',
  }));
  model.add(tf.layers.dropout({ rate: 0.2 }));

  // Output layer - binary classification
  model.add(tf.layers.dense({
    units: 1,
    activation: 'sigmoid',
  }));

  model.compile({
    optimizer: tf.train.adam(config.learningRate),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy', 'precision', 'recall'],
  });

  return model;
}

function extractForecastFeatures(
  data: number[][],
  featureNames: string[],
  lookbackWindows: number[]
): { X: number[][]; y: number[]; featureNames: string[] } {
  // This creates features from historical data for forecasting
  // For each timestep, we create features from multiple lookback windows
  // and the target is whether an anomaly occurs in the next horizon

  const samples: number[][] = [];
  const targets: number[] = [];
  const derivedFeatureNames: string[] = [];

  // This is a simplified version - in practice you'd have anomaly labels
  // For now, we'll create synthetic features that could be used
  const numFeatures = data[0].length;
  const maxLookback = Math.max(...lookbackWindows);

  // We need to create this from the actual anomaly data
  // This function should be called with pre-labeled data
  return { X: [], y: [], featureNames: [] };
}

export async function trainForecastModel(
  forecastModel: ForecastModel,
  prisma: PrismaClient,
  deviceId: string,
  horizonMinutes: number
): Promise<ForecastModel> {
  const { lookbackWindows, epochs, batchSize, validationSplit, featureCount } = forecastModel.config;

  // Fetch historical data with anomaly labels
  const since = new Date();
  since.setDate(since.getDate() - 30); // 30 days of history

  const metrics = await prisma.metric.findMany({
    where: {
      deviceId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: 'asc' },
  });

  const anomalies = await prisma.anomaly.findMany({
    where: {
      deviceId,
      timestamp: { gte: since },
    },
    select: { timestamp: true, severity: true },
  });

  if (metrics.length < 200) {
    throw new Error(`Insufficient metrics data for forecasting: ${metrics.length} < 200`);
  }

  // Group metrics into 5-minute buckets (same as anomaly detection)
  const BUCKET_MS = 5 * 60 * 1000;
  const grouped = new Map<number, { timestamp: Date; features: number[]; hasAnomaly: boolean }>();

  for (const m of metrics) {
    const bucketStartMs = Math.floor(m.timestamp.getTime() / BUCKET_MS) * BUCKET_MS;
    if (!grouped.has(bucketStartMs)) {
      grouped.set(bucketStartMs, {
        timestamp: new Date(bucketStartMs),
        features: [0, 0, 0, 0, 0], // latency, cpu, memory, inOctets, outOctets
        hasAnomaly: false,
      });
    }
    const entry = grouped.get(bucketStartMs)!;
    const mt = m.metricType?.toLowerCase();
    if (mt === 'icmp' && m.latency != null) entry.features[0] = m.latency;
    if (mt === 'snmp') {
      if (m.cpuUtil != null) entry.features[1] = m.cpuUtil;
      if (m.memUtil != null) entry.features[2] = m.memUtil;
      const ifaces = Array.isArray(m.interfaceData) ? m.interfaceData : [];
      const inVals = (ifaces as Array<{ inOctets?: number }>).map((i) => i.inOctets).filter((v): v is number => typeof v === 'number');
      const outVals = (ifaces as Array<{ outOctets?: number }>).map((i) => i.outOctets).filter((v): v is number => typeof v === 'number');
      if (inVals.length > 0) entry.features[3] = inVals.reduce((a, b) => a + b, 0);
      if (outVals.length > 0) entry.features[4] = outVals.reduce((a, b) => a + b, 0);
    }
  }

  // Mark anomaly buckets
  for (const a of anomalies) {
    const bucketStartMs = Math.floor(a.timestamp.getTime() / BUCKET_MS) * BUCKET_MS;
    const entry = grouped.get(bucketStartMs);
    if (entry) entry.hasAnomaly = true;
  }

  const sortedBuckets = Array.from(grouped.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Build feature matrix and labels
  // For each bucket, create features from lookback windows
  // Label = 1 if anomaly occurs within next horizonMinutes
  const horizonBuckets = Math.ceil(horizonMinutes / 5);

  const featureRows: number[][] = [];
  const labels: number[] = [];

  const baseFeatureNames = ['latency', 'cpu', 'memory', 'inOctets', 'outOctets'];

  for (let i = 0; i < sortedBuckets.length - horizonBuckets; i++) {
    const current = sortedBuckets[i];

    // Create features from multiple lookback windows
    const features: number[] = [];

    for (const window of lookbackWindows) {
      const windowBuckets = Math.ceil(window / 5);
      const startIdx = Math.max(0, i - windowBuckets + 1);
      const windowData = sortedBuckets.slice(startIdx, i + 1).map(b => b.features);

      if (windowData.length === 0) continue;

      // Statistics for this window
      for (let f = 0; f < 5; f++) {
        const vals = windowData.map(d => d[f]).filter(v => v != null && !isNaN(v));
        if (vals.length === 0) {
          features.push(0, 0, 0, 0);
          continue;
        }
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length;
        const std = Math.sqrt(variance);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        features.push(mean, std, min, max);
      }
    }

    // Current values
    features.push(...current.features);

    // Temporal features
    const ts = current.timestamp;
    features.push(ts.getHours(), ts.getDay(), ts.getHours() >= 8 && ts.getHours() <= 18 ? 1 : 0);

    // Label: anomaly in next horizon
    let hasFutureAnomaly = false;
    for (let h = 1; h <= horizonBuckets; h++) {
      if (i + h < sortedBuckets.length && sortedBuckets[i + h].hasAnomaly) {
        hasFutureAnomaly = true;
        break;
      }
    }

    featureRows.push(features);
    labels.push(hasFutureAnomaly ? 1 : 0);
  }

  if (featureRows.length < 100) {
    throw new Error(`Insufficient training samples for forecasting: ${featureRows.length}`);
  }

  // Build derived feature names
  const derivedNames: string[] = [];
  for (const window of lookbackWindows) {
    for (const base of baseFeatureNames) {
      derivedNames.push(`${base}_mean_${window}m`, `${base}_std_${window}m`, `${base}_min_${window}m`, `${base}_max_${window}m`);
    }
  }
  derivedNames.push(...baseFeatureNames, 'hour', 'dayOfWeek', 'isBusinessHours');

  // Balance dataset if needed (anomalies are rare)
  const positiveCount = labels.filter(l => l === 1).length;
  const negativeCount = labels.filter(l => l === 0).length;

  let finalX = featureRows;
  let finalY = labels;

  if (positiveCount > 0 && negativeCount / positiveCount > 10) {
    // Undersample negative class
    const targetNegative = positiveCount * 5;
    const negativeIndices = labels.map((l, i) => l === 0 ? i : -1).filter(i => i !== -1);
    const sampledNegatives = negativeIndices.sort(() => Math.random() - 0.5).slice(0, targetNegative);
    const positiveIndices = labels.map((l, i) => l === 1 ? i : -1).filter(i => i !== -1);
    const keepIndices = [...positiveIndices, ...sampledNegatives].sort((a, b) => a - b);

    finalX = keepIndices.map(i => featureRows[i]);
    finalY = keepIndices.map(i => labels[i]);
  }

  // Normalize features
  forecastModel.scaler = buildStatisticalModel(finalX);
  forecastModel.featureNames = derivedNames;

  const normalizedX = finalX.map(row =>
    row.map((val, i) => {
      const mean = forecastModel.scaler.means[i] ?? 0;
      const std = forecastModel.scaler.stds[i] ?? 1;
      return std > 0 ? (val - mean) / std : 0;
    })
  );

  // Build and train model
  forecastModel.model = buildForecastModel(finalX[0].length, forecastModel.config);

  const XTensor = tf.tensor2d(normalizedX);
  const YTensor = tf.tensor2d(finalY.map(v => [v]));

  console.log(`[Forecasting] Training on ${finalX.length} samples (${positiveCount} positive)...`);

  const history = await forecastModel.model.fit(XTensor, YTensor, {
    epochs,
    batchSize,
    validationSplit,
    verbose: 0,
    classWeight: { 0: 1, 1: negativeCount / Math.max(positiveCount, 1) },
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 10 === 0) {
          console.log(`[Forecasting] Epoch ${epoch}: loss=${logs?.loss?.toFixed(4)}, acc=${logs?.accuracy?.toFixed(4)}`);
        }
      },
    },
  });

  // Evaluate
  const predictions = forecastModel.model.predict(XTensor) as tf.Tensor2D;
  const predData = predictions.dataSync() as Float32Array;
  const predLabels = Array.from(predData).map(p => p > DEFAULT_FORECAST_CONFIG.threshold ? 1 : 0);

  const tp = predLabels.filter((p, i) => p === 1 && finalY[i] === 1).length;
  const fp = predLabels.filter((p, i) => p === 1 && finalY[i] === 0).length;
  const fn = predLabels.filter((p, i) => p === 0 && finalY[i] === 1).length;
  const tn = predLabels.filter((p, i) => p === 0 && finalY[i] === 0).length;

  const accuracy = (tp + tn) / finalY.length;
  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);
  const f1 = 2 * precision * recall / Math.max(precision + recall, 0.001);

  forecastModel.performance = { accuracy, precision, recall, f1, auc: 0 }; // AUC would need more computation
  forecastModel.isTrained = true;
  forecastModel.lastTrained = new Date();

  console.log(`[Forecasting] Performance: accuracy=${accuracy.toFixed(3)}, precision=${precision.toFixed(3)}, recall=${recall.toFixed(3)}, f1=${f1.toFixed(3)}`);

  // Cleanup
  XTensor.dispose();
  YTensor.dispose();
  predictions.dispose();

  return forecastModel;
}

export async function predictRisk(
  forecastModel: ForecastModel,
  prisma: PrismaClient,
  deviceId: string,
  horizonMinutes: number = 60
): Promise<RiskPrediction | null> {
  if (!forecastModel.isTrained || !forecastModel.model) {
    // Try to train on demand
    try {
      await trainForecastModel(forecastModel, prisma, deviceId, horizonMinutes);
    } catch (err) {
      console.error(`[Forecasting] Failed to train model for ${deviceId}:`, err);
      return null;
    }
  }

  if (!forecastModel.model) return null;

  // Get recent metrics for prediction
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours
  const metrics = await prisma.metric.findMany({
    where: { deviceId, timestamp: { gte: since } },
    orderBy: { timestamp: 'asc' },
  });

  if (metrics.length < 20) return null;

  // Group into buckets (same as training)
  const BUCKET_MS = 5 * 60 * 1000;
  const grouped = new Map<number, { timestamp: Date; features: number[] }>();

  for (const m of metrics) {
    const bucketStartMs = Math.floor(m.timestamp.getTime() / BUCKET_MS) * BUCKET_MS;
    if (!grouped.has(bucketStartMs)) {
      grouped.set(bucketStartMs, {
        timestamp: new Date(bucketStartMs),
        features: [0, 0, 0, 0, 0],
      });
    }
    const entry = grouped.get(bucketStartMs)!;
    const mt = m.metricType?.toLowerCase();
    if (mt === 'icmp' && m.latency != null) entry.features[0] = m.latency;
    if (mt === 'snmp') {
      if (m.cpuUtil != null) entry.features[1] = m.cpuUtil;
      if (m.memUtil != null) entry.features[2] = m.memUtil;
      const ifaces = Array.isArray(m.interfaceData) ? m.interfaceData : [];
      const inVals = (ifaces as Array<{ inOctets?: number }>).map((i) => i.inOctets).filter((v): v is number => typeof v === 'number');
      const outVals = (ifaces as Array<{ outOctets?: number }>).map((i) => i.outOctets).filter((v): v is number => typeof v === 'number');
      if (inVals.length > 0) entry.features[3] = inVals.reduce((a, b) => a + b, 0);
      if (outVals.length > 0) entry.features[4] = outVals.reduce((a, b) => a + b, 0);
    }
  }

  const sortedBuckets = Array.from(grouped.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (sortedBuckets.length === 0) return null;

  // Use the latest bucket for prediction
  const latest = sortedBuckets[sortedBuckets.length - 1];

  // Build features (same as training)
  const features: number[] = [];
  for (const window of forecastModel.config.lookbackWindows) {
    const windowBuckets = Math.ceil(window / 5);
    const startIdx = Math.max(0, sortedBuckets.length - windowBuckets);
    const windowData = sortedBuckets.slice(startIdx).map(b => b.features);

    for (let f = 0; f < 5; f++) {
      const vals = windowData.map(d => d[f]).filter(v => v != null && !isNaN(v));
      if (vals.length === 0) { features.push(0, 0, 0, 0); continue; }
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length;
      const std = Math.sqrt(variance);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      features.push(mean, std, min, max);
    }
  }
  features.push(...latest.features);
  const ts = latest.timestamp;
  features.push(ts.getHours(), ts.getDay(), ts.getHours() >= 8 && ts.getHours() <= 18 ? 1 : 0);

  // Normalize
  const normalized = features.map((val, i) => {
    const mean = forecastModel.scaler.means[i] ?? 0;
    const std = forecastModel.scaler.stds[i] ?? 1;
    return std > 0 ? (val - mean) / std : 0;
  });

  // Predict
  const inputTensor = tf.tensor2d([normalized]);
  const prediction = forecastModel.model!.predict(inputTensor) as tf.Tensor2D;
  const riskScore = (prediction.dataSync() as Float32Array)[0];

  inputTensor.dispose();
  prediction.dispose();

  // Determine risk level
  let riskLevel: RiskPrediction['riskLevel'] = 'LOW';
  if (riskScore >= 0.8) riskLevel = 'CRITICAL';
  else if (riskScore >= 0.6) riskLevel = 'HIGH';
  else if (riskScore >= 0.4) riskLevel = 'MEDIUM';

  // Feature importance (simplified - using gradient)
  const contributingFactors = forecastModel.featureNames
    .map((name, i) => ({ feature: name, value: features[i], importance: Math.abs(normalized[i]) }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);

  // Recommended actions
  const recommendedActions: string[] = [];
  if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
    recommendedActions.push('Increase monitoring frequency');
    recommendedActions.push('Prepare incident response team');
    if (contributingFactors[0]?.feature.includes('cpu')) recommendedActions.push('Check CPU-intensive processes');
    if (contributingFactors[0]?.feature.includes('memory')) recommendedActions.push('Check memory leaks');
    if (contributingFactors[0]?.feature.includes('latency')) recommendedActions.push('Check network path and QoS');
  } else if (riskLevel === 'MEDIUM') {
    recommendedActions.push('Monitor closely for next hour');
    recommendedActions.push('Review recent changes');
  }

  return {
    deviceId,
    timestamp: new Date(),
    riskScore,
    riskLevel,
    horizonMinutes,
    contributingFactors,
    recommendedActions,
  };
}

export function disposeForecastModel(forecastModel: ForecastModel): void {
  if (forecastModel.model) {
    forecastModel.model.dispose();
    forecastModel.model = null;
    forecastModel.isTrained = false;
  }
}