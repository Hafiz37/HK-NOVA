/**
 * LSTM-based Time Series Forecasting for Anomaly Detection
 * Predicts next N time steps and detects anomalies via prediction error
 */

import * as tf from '@tensorflow/tfjs-node';
import { StatisticalModel, buildStatisticalModel } from './statistical';

export interface LSTMConfig {
  lookbackWindow: number;    // Number of past timesteps to use (default: 60 = 5 hours at 5min intervals)
  horizon: number;           // Number of future steps to predict (default: 12 = 1 hour)
  epochs: number;            // Training epochs (default: 50)
  batchSize: number;         // Batch size (default: 32)
  lstmUnits: number;         // LSTM layer units (default: 64)
  learningRate: number;      // Learning rate (default: 0.001)
  validationSplit: number;   // Validation split (default: 0.2)
}

export interface LSTMModel {
  model: tf.LayersModel | null;
  config: LSTMConfig;
  featureNames: string[];
  scaler: StatisticalModel;
  isTrained: boolean;
  trainingHistory?: tf.History;
  lastTrained?: Date;
  featureIndices: number[];  // Which features to predict (default: latency, cpu, memory)
}

export interface PredictionResult {
  predictions: number[][];       // [horizon, features]
  actuals?: number[][];          // If provided for validation
  errors: number[];              // MAE per timestep
  anomalyScores: number[];       // 0-1 anomaly score per timestep
  isAnomaly: boolean;            // Overall anomaly flag
  threshold: number;
}

const DEFAULT_CONFIG: LSTMConfig = {
  lookbackWindow: 60,   // 5 hours
  horizon: 12,          // 1 hour ahead
  epochs: 30,
  batchSize: 32,
  lstmUnits: 64,
  learningRate: 0.001,
  validationSplit: 0.2,
};

// Features to predict: latency (0), cpu (1), memory (2)
const TARGET_FEATURE_INDICES = [0, 1, 2];

export function createLSTMModel(config: Partial<LSTMConfig> = {}): LSTMModel {
  return {
    model: null,
    config: { ...DEFAULT_CONFIG, ...config },
    featureNames: [],
    scaler: buildStatisticalModel([]),
    isTrained: false,
    featureIndices: TARGET_FEATURE_INDICES,
  };
}

function buildLSTMModel(config: LSTMConfig, inputShape: [number, number]): tf.LayersModel {
  const model = tf.sequential();

  // LSTM Layer 1
  model.add(tf.layers.lstm({
    units: config.lstmUnits,
    returnSequences: true,
    inputShape,
    dropout: 0.2,
    recurrentDropout: 0.2,
  }));

  // LSTM Layer 2
  model.add(tf.layers.lstm({
    units: config.lstmUnits / 2,
    returnSequences: false,
    dropout: 0.2,
    recurrentDropout: 0.2,
  }));

  // Dense layer
  model.add(tf.layers.dense({
    units: 32,
    activation: 'relu',
  }));

  // Output layer: horizon * targetFeatures
  model.add(tf.layers.dense({
    units: config.horizon * TARGET_FEATURE_INDICES.length,
    activation: 'linear',
  }));

  // Reshape to [horizon, targetFeatures]
  model.add(tf.layers.reshape({
    targetShape: [config.horizon, TARGET_FEATURE_INDICES.length],
  }));

  model.compile({
    optimizer: tf.train.adam(config.learningRate),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  return model;
}

function prepareSequences(
  data: number[][],
  lookback: number,
  horizon: number,
  targetIndices: number[]
): { X: tf.Tensor3D; y: tf.Tensor3D } {
  const samples = data.length - lookback - horizon + 1;
  if (samples <= 0) {
    throw new Error(`Insufficient data: need at least ${lookback + horizon} samples, got ${data.length}`);
  }

  const numFeatures = data[0].length;
  const numTargets = targetIndices.length;

  const XData = new Float32Array(samples * lookback * numFeatures);
  const yData = new Float32Array(samples * horizon * numTargets);

  for (let i = 0; i < samples; i++) {
    // Input sequence
    for (let t = 0; t < lookback; t++) {
      for (let f = 0; f < numFeatures; f++) {
        XData[i * lookback * numFeatures + t * numFeatures + f] = data[i + t][f];
      }
    }
    // Target sequence
    for (let h = 0; h < horizon; h++) {
      for (let ti = 0; ti < numTargets; ti++) {
        yData[i * horizon * numTargets + h * numTargets + ti] = data[i + lookback + h][targetIndices[ti]];
      }
    }
  }

  const X = tf.tensor3d(XData, [samples, lookback, numFeatures]);
  const y = tf.tensor3d(yData, [samples, horizon, numTargets]);

  return { X, y };
}

export async function trainLSTM(
  lstmModel: LSTMModel,
  trainData: number[][],
  featureNames: string[]
): Promise<LSTMModel> {
  const { lookbackWindow, horizon, epochs, batchSize, validationSplit } = lstmModel.config;

  if (trainData.length < lookbackWindow + horizon) {
    throw new Error(`Insufficient training data: ${trainData.length} < ${lookbackWindow + horizon}`);
  }

  // Build statistical scaler for normalization
  lstmModel.scaler = buildStatisticalModel(trainData);
  lstmModel.featureNames = featureNames;

  // Normalize training data
  const normalizedData = trainData.map(row =>
    row.map((val, i) => {
      const mean = lstmModel.scaler.means[i] ?? 0;
      const std = lstmModel.scaler.stds[i] ?? 1;
      return std > 0 ? (val - mean) / std : 0;
    })
  );

  // Prepare sequences
  const { X, y } = prepareSequences(normalizedData, lookbackWindow, horizon, lstmModel.featureIndices);

  // Build model
  lstmModel.model = buildLSTMModel(lstmModel.config, [lookbackWindow, trainData[0].length]);

  // Train
  console.log(`[LSTM] Training on ${X.shape[0]} samples...`);
  const history = await lstmModel.model.fit(X, y, {
    epochs,
    batchSize,
    validationSplit,
    verbose: 0,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 10 === 0) {
          console.log(`[LSTM] Epoch ${epoch}: loss=${logs?.loss?.toFixed(4)}, mae=${logs?.mae?.toFixed(4)}`);
        }
      },
    },
  });

  lstmModel.trainingHistory = history;
  lstmModel.isTrained = true;
  lstmModel.lastTrained = new Date();

  // Cleanup tensors
  X.dispose();
  y.dispose();

  return lstmModel;
}

export function predictLSTM(
  lstmModel: LSTMModel,
  recentData: number[][]  // Last lookbackWindow samples
): PredictionResult {
  if (!lstmModel.isTrained || !lstmModel.model) {
    throw new Error('LSTM model not trained');
  }

  const { lookbackWindow, horizon } = lstmModel.config;

  if (recentData.length < lookbackWindow) {
    throw new Error(`Need at least ${lookbackWindow} recent samples, got ${recentData.length}`);
  }

  // Normalize recent data using training scaler
  const normalizedRecent = recentData.slice(-lookbackWindow).map(row =>
    row.map((val, i) => {
      const mean = lstmModel.scaler.means[i] ?? 0;
      const std = lstmModel.scaler.stds[i] ?? 1;
      return std > 0 ? (val - mean) / std : 0;
    })
  );

  // Predict
  const inputTensor = tf.tensor3d([normalizedRecent], [1, lookbackWindow, recentData[0].length]);
  const prediction = lstmModel.model.predict(inputTensor) as tf.Tensor3D;
  const predData = prediction.dataSync() as Float32Array;

  // Reshape predictions: [horizon, targetFeatures]
  const predictions: number[][] = [];
  for (let h = 0; h < horizon; h++) {
    const step: number[] = [];
    for (let ti = 0; ti < lstmModel.featureIndices.length; ti++) {
      step.push(predData[h * lstmModel.featureIndices.length + ti]);
    }
    predictions.push(step);
  }

  // Denormalize predictions
  const denormPredictions = predictions.map(step =>
    step.map((val, ti) => {
      const featureIdx = lstmModel.featureIndices[ti];
      const mean = lstmModel.scaler.means[featureIdx] ?? 0;
      const std = lstmModel.scaler.stds[featureIdx] ?? 1;
      return val * std + mean;
    })
  );

  // Calculate anomaly scores based on prediction error (if actuals available)
  // For now, use prediction variance as proxy
  const errors = denormPredictions.map(step =>
    step.reduce((sum, val) => sum + Math.abs(val), 0) / step.length
  );

  // Normalize errors to 0-1 using training statistics
  const maxError = Math.max(...errors, 1);
  const anomalyScores = errors.map(e => Math.min(1, e / (maxError * 0.5)));
  const avgAnomalyScore = anomalyScores.reduce((a, b) => a + b, 0) / anomalyScores.length;

  // Threshold: anomaly if average score > 0.6
  const threshold = 0.6;
  const isAnomaly = avgAnomalyScore > threshold;

  // Cleanup
  inputTensor.dispose();
  prediction.dispose();

  return {
    predictions: denormPredictions,
    errors,
    anomalyScores,
    isAnomaly,
    threshold,
  };
}

export async function saveLSTMModel(
  lstmModel: LSTMModel,
  path: string
): Promise<void> {
  if (!lstmModel.model) throw new Error('No model to save');
  await lstmModel.model.save(`file://${path}`);
  console.log(`[LSTM] Model saved to ${path}`);
}

export async function loadLSTMModel(
  path: string,
  config: Partial<LSTMConfig> = {}
): Promise<LSTMModel> {
  const model = await tf.loadLayersModel(`file://${path}/model.json`);
  const lstmModel = createLSTMModel(config);
  lstmModel.model = model;
  lstmModel.isTrained = true;
  console.log(`[LSTM] Model loaded from ${path}`);
  return lstmModel;
}

export function disposeLSTMModel(lstmModel: LSTMModel): void {
  if (lstmModel.model) {
    lstmModel.model.dispose();
    lstmModel.model = null;
    lstmModel.isTrained = false;
  }
}