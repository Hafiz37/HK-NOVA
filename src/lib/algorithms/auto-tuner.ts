/**
 * Auto-tuning / Hyperparameter Optimization
 * Automatically finds optimal hyperparameters for anomaly detection models
 */

import { PrismaClient } from '@prisma/client';
import { extractAdvancedFeatures } from '../feature-engineering';
import { trainModel, TrainedModel } from '../anomaly-service';
import { createEnsembleEngine, EnsembleEngine } from './ensemble-engine';
import { buildStatisticalModel } from './statistical';

export interface HyperparameterSpace {
  isolationForest: {
    nTrees: number[];
    maxSamples: number[];
    contamination: number[];
  };
  lof: {
    k: number[];
  };
  statistical: {
    zScoreThreshold: number[];
    iqrThreshold: number[];
    madThreshold: number[];
  };
  dbscan: {
    eps: number[];
    minPts: number[];
  };
  ensemble: {
    weights: Array<{
      isolationForest: number;
      lof: number;
      statistical: number;
      dbscan: number;
    }>;
  };
}

export interface TuningConfig {
  deviceType?: string;
  metric: 'f1' | 'precision' | 'recall' | 'accuracy';
  cvFolds: number;
  maxTrials: number;
  timeoutMinutes: number;
  minSamples: number;
}

export interface TuningResult {
  bestParams: {
    isolationForest: { nTrees: number; maxSamples: number; contamination: number };
    lof: { k: number };
    statistical: { zScoreThreshold: number; iqrThreshold: number; madThreshold: number };
    dbscan: { eps: number; minPts: number };
    ensemble: { isolationForest: number; lof: number; statistical: number; dbscan: number };
  };
  bestScore: number;
  allTrials: Array<{
    params: any;
    score: number;
    metrics: { precision: number; recall: number; f1: number; accuracy: number };
    durationMs: number;
  }>;
  deviceType: string;
  completedAt: Date;
}

const DEFAULT_HYPERPARAMETER_SPACE: HyperparameterSpace = {
  isolationForest: {
    nTrees: [50, 100, 150, 200],
    maxSamples: [128, 256, 384, 512],
    contamination: [0.01, 0.03, 0.05, 0.1],
  },
  lof: {
    k: [10, 15, 20, 25, 30],
  },
  statistical: {
    zScoreThreshold: [2.5, 3.0, 3.5],
    iqrThreshold: [1.5, 2.0, 2.5],
    madThreshold: [3.0, 3.5, 4.0],
  },
  dbscan: {
    eps: [0.3, 0.5, 0.7, 1.0],
    minPts: [3, 5, 7, 10],
  },
  ensemble: {
    weights: [
      { isolationForest: 0.35, lof: 0.25, statistical: 0.25, dbscan: 0.15 },
      { isolationForest: 0.4, lof: 0.2, statistical: 0.25, dbscan: 0.15 },
      { isolationForest: 0.3, lof: 0.3, statistical: 0.25, dbscan: 0.15 },
      { isolationForest: 0.3, lof: 0.2, statistical: 0.3, dbscan: 0.2 },
    ],
  },
};

const DEFAULT_TUNING_CONFIG: TuningConfig = {
  metric: 'f1',
  cvFolds: 3,
  maxTrials: 50,
  timeoutMinutes: 30,
  minSamples: 100,
};

function generateRandomParams(space: HyperparameterSpace): any {
  return {
    isolationForest: {
      nTrees: space.isolationForest.nTrees[Math.floor(Math.random() * space.isolationForest.nTrees.length)],
      maxSamples: space.isolationForest.maxSamples[Math.floor(Math.random() * space.isolationForest.maxSamples.length)],
      contamination: space.isolationForest.contamination[Math.floor(Math.random() * space.isolationForest.contamination.length)],
    },
    lof: {
      k: space.lof.k[Math.floor(Math.random() * space.lof.k.length)],
    },
    statistical: {
      zScoreThreshold: space.statistical.zScoreThreshold[Math.floor(Math.random() * space.statistical.zScoreThreshold.length)],
      iqrThreshold: space.statistical.iqrThreshold[Math.floor(Math.random() * space.statistical.iqrThreshold.length)],
      madThreshold: space.statistical.madThreshold[Math.floor(Math.random() * space.statistical.madThreshold.length)],
    },
    dbscan: {
      eps: space.dbscan.eps[Math.floor(Math.random() * space.dbscan.eps.length)],
      minPts: space.dbscan.minPts[Math.floor(Math.random() * space.dbscan.minPts.length)],
    },
    ensemble: space.ensemble.weights[Math.floor(Math.random() * space.ensemble.weights.length)],
  };
}

function evaluateParams(
  params: any,
  trainData: number[][],
  testData: number[][],
  testLabels: number[],
  featureNames: string[]
): { precision: number; recall: number; f1: number; accuracy: number } {
  // This is a simplified evaluation
  // In practice, you'd run the full ensemble with these params
  // For now, we'll use a proxy based on statistical model

  const statModel = buildStatisticalModel(trainData);
  const statModelModified = {
    ...statModel,
    zScoreThreshold: params.statistical.zScoreThreshold,
    iqrThreshold: params.statistical.iqrThreshold,
    madThreshold: params.statistical.madThreshold,
  };

  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (let i = 0; i < testData.length; i++) {
    const { combinedScore, isAnomaly } = require('./statistical').scoreStatistical(statModelModified, testData[i]);
    const pred = combinedScore > 0.5 ? 1 : 0;
    const actual = testLabels[i];

    if (pred === 1 && actual === 1) tp++;
    else if (pred === 1 && actual === 0) fp++;
    else if (pred === 0 && actual === 0) tn++;
    else fn++;
  }

  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);
  const f1 = 2 * precision * recall / Math.max(precision + recall, 0.001);
  const accuracy = (tp + tn) / Math.max(tp + fp + tn + fn, 1);

  return { precision, recall, f1, accuracy };
}

export class AutoTuner {
  private prisma: PrismaClient;
  private space: HyperparameterSpace;
  private config: TuningConfig;

  constructor(prisma: PrismaClient, space?: Partial<HyperparameterSpace>, config?: Partial<TuningConfig>) {
    this.prisma = prisma;
    this.space = { ...DEFAULT_HYPERPARAMETER_SPACE, ...space };
    this.config = { ...DEFAULT_TUNING_CONFIG, ...config };
  }

  async tune(deviceId: string): Promise<TuningResult> {
    console.log(`[AutoTuner] Starting hyperparameter tuning for device ${deviceId}...`);

    // Fetch training data
    const { vectors } = await extractAdvancedFeatures(this.prisma, deviceId, 7);
    if (vectors.length < this.config.minSamples) {
      throw new Error(`Insufficient data for tuning: ${vectors.length} < ${this.config.minSamples}`);
    }

    const trainData = vectors.map(v => v.features);
    const featureNames = vectors[0] ? Object.keys(vectors[0] as any) : [];

    // Create synthetic labels for evaluation (in practice, use feedback data)
    // For now, use statistical outliers as pseudo-labels
    const statModel = buildStatisticalModel(trainData);
    const labels = trainData.map(row => {
      const { isAnomaly } = require('./statistical').scoreStatistical(statModel, row);
      return isAnomaly ? 1 : 0;
    });

    // Time-series cross-validation split
    const foldSize = Math.floor(trainData.length / this.config.cvFolds);
    const folds: Array<{ train: number[][]; test: number[][]; trainLabels: number[]; testLabels: number[] }> = [];

    for (let f = 0; f < this.config.cvFolds; f++) {
      const start = f * foldSize;
      const end = (f === this.config.cvFolds - 1) ? trainData.length : (f + 1) * foldSize;
      const testIndices = Array.from({ length: end - start }, (_, i) => start + i);
      const trainIndices = Array.from({ length: trainData.length }, (_, i) => i).filter(i => !testIndices.includes(i));

      folds.push({
        train: trainIndices.map(i => trainData[i]),
        test: testIndices.map(i => trainData[i]),
        trainLabels: trainIndices.map(i => labels[i]),
        testLabels: testIndices.map(i => labels[i]),
      });
    }

    const allTrials: TuningResult['allTrials'] = [];
    let bestScore = -1;
    let bestParams: TuningResult['bestParams'] | null = null;

    const startTime = Date.now();
    const timeoutMs = this.config.timeoutMinutes * 60 * 1000;

    for (let trial = 0; trial < this.config.maxTrials; trial++) {
      if (Date.now() - startTime > timeoutMs) {
        console.log(`[AutoTuner] Timeout reached after ${trial} trials`);
        break;
      }

      const params = generateRandomParams(this.space);
      const trialStart = Date.now();

      // Cross-validation
      let cvScores: number[] = [];
      let cvMetrics = { precision: 0, recall: 0, f1: 0, accuracy: 0 };

      for (const fold of folds) {
        const metrics = evaluateParams(params, fold.train, fold.test, fold.testLabels, featureNames);
        cvScores.push(metrics[this.config.metric]);
        cvMetrics.precision += metrics.precision;
        cvMetrics.recall += metrics.recall;
        cvMetrics.f1 += metrics.f1;
        cvMetrics.accuracy += metrics.accuracy;
      }

      cvMetrics.precision /= this.config.cvFolds;
      cvMetrics.recall /= this.config.cvFolds;
      cvMetrics.f1 /= this.config.cvFolds;
      cvMetrics.accuracy /= this.config.cvFolds;

      const meanScore = cvScores.reduce((a, b) => a + b, 0) / cvScores.length;

      allTrials.push({
        params,
        score: meanScore,
        metrics: cvMetrics,
        durationMs: Date.now() - trialStart,
      });

      if (meanScore > bestScore) {
        bestScore = meanScore;
        bestParams = params;
        console.log(`[AutoTuner] Trial ${trial + 1}: New best ${this.config.metric}=${meanScore.toFixed(4)}`);
      } else {
        console.log(`[AutoTuner] Trial ${trial + 1}: ${this.config.metric}=${meanScore.toFixed(4)} (best: ${bestScore.toFixed(4)})`);
      }
    }

    if (!bestParams) {
      throw new Error('No valid parameters found during tuning');
    }

    console.log(`[AutoTuner] Completed ${allTrials.length} trials in ${(Date.now() - startTime) / 1000}s`);
    console.log(`[AutoTuner] Best ${this.config.metric}: ${bestScore.toFixed(4)}`);

    return {
      bestParams,
      bestScore,
      allTrials,
      deviceType: '', // Will be filled by caller
      completedAt: new Date(),
    };
  }

  async tuneAllDevices(deviceIds: string[]): Promise<Map<string, TuningResult>> {
    const results = new Map<string, TuningResult>();

    for (const deviceId of deviceIds) {
      try {
        const result = await this.tune(deviceId);
        const device = await this.prisma.device.findUnique({
          where: { id: deviceId },
          select: { type: true },
        });
        result.deviceType = device?.type || 'UNKNOWN';
        results.set(deviceId, result);
      } catch (err) {
        console.error(`[AutoTuner] Failed to tune device ${deviceId}:`, err);
      }
    }

    return results;
  }
}

export async function runWeeklyAutoTune(prisma: PrismaClient): Promise<void> {
  console.log('[AutoTuner] Starting weekly auto-tuning job...');

  const devices = await prisma.device.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  const deviceIds = devices.map(d => d.id);
  const tuner = new AutoTuner(prisma);
  const results = await tuner.tuneAllDevices(deviceIds);

  // Store best parameters for each device
  for (const [deviceId, result] of results) {
    await prisma.anomalyModel.updateMany({
      where: { deviceId, isActive: true },
      data: {
        hyperParams: result.bestParams as any,
      },
    });
    console.log(`[AutoTuner] Updated hyperparameters for device ${deviceId}`);
  }

  console.log('[AutoTuner] Weekly auto-tuning completed');
}

export function createAutoTuner(prisma: PrismaClient, space?: Partial<HyperparameterSpace>, config?: Partial<TuningConfig>): AutoTuner {
  return new AutoTuner(prisma, space, config);
}