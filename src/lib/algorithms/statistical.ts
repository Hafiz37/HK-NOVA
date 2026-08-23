/**
 * Statistical anomaly detection methods:
 * - Z-score (Standard Score)
 * - IQR (Interquartile Range)
 * - MAD (Median Absolute Deviation)
 * - Modified Z-score (using MAD)
 */

export interface StatisticalModel {
  means: number[];
  stds: number[];
  medians: number[];
  mads: number[];
  q1s: number[];
  q3s: number[];
  iqrThreshold: number;
  zScoreThreshold: number;
  madThreshold: number;
  featureCount: number;
}

export function buildStatisticalModel(data: number[][]): StatisticalModel {
  if (data.length === 0 || data[0].length === 0) {
    return {
      means: [],
      stds: [],
      medians: [],
      mads: [],
      q1s: [],
      q3s: [],
      iqrThreshold: 1.5,
      zScoreThreshold: 3,
      madThreshold: 3.5,
      featureCount: 0,
    };
  }

  const n = data.length;
  const d = data[0].length;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(1);
  const medians = new Array(d).fill(0);
  const mads = new Array(d).fill(1);
  const q1s = new Array(d).fill(0);
  const q3s = new Array(d).fill(0);

  for (let i = 0; i < d; i++) {
    const col = data.map((row) => row[i]).filter((v) => v != null && !isNaN(v));
    if (col.length === 0) continue;

    const sorted = [...col].sort((a, b) => a - b);
    const sum = col.reduce((a, b) => a + b, 0);
    const mean = sum / col.length;
    const variance = col.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / col.length;

    means[i] = mean;
    stds[i] = Math.sqrt(variance) || 1;

    // Median
    const mid = Math.floor(sorted.length / 2);
    medians[i] = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    // Q1, Q3 for IQR
    const q1Idx = Math.floor(sorted.length * 0.25);
    const q3Idx = Math.floor(sorted.length * 0.75);
    q1s[i] = sorted[q1Idx];
    q3s[i] = sorted[q3Idx];

    // MAD (Median Absolute Deviation)
    const deviations = col.map((v) => Math.abs(v - medians[i]));
    const sortedDevs = [...deviations].sort((a, b) => a - b);
    const madMid = Math.floor(sortedDevs.length / 2);
    mads[i] = sortedDevs.length % 2 === 0
      ? (sortedDevs[madMid - 1] + sortedDevs[madMid]) / 2
      : sortedDevs[madMid];
    if (mads[i] === 0) mads[i] = 1;
  }

  return { means, stds, medians, mads, q1s, q3s, iqrThreshold: 1.5, zScoreThreshold: 3, madThreshold: 3.5, featureCount: d };
}

export function scoreStatistical(model: StatisticalModel, point: number[]): {
  zScore: number;
  iqrScore: number;
  madScore: number;
  combinedScore: number;
  isAnomaly: boolean;
  anomalyFeatures: string[];
} {
  if (model.featureCount === 0 || point.length === 0) {
    return { zScore: 0, iqrScore: 0, madScore: 0, combinedScore: 0, isAnomaly: false, anomalyFeatures: [] };
  }

  let maxZScore = 0;
  let maxIQRScore = 0;
  let maxMADScore = 0;
  const anomalyFeatures: string[] = [];

  for (let i = 0; i < Math.min(model.featureCount, point.length); i++) {
    const val = point[i];
    if (val == null || isNaN(val)) continue;

    // Z-score
    const z = model.stds[i] > 0 ? Math.abs((val - model.means[i]) / model.stds[i]) : 0;
    maxZScore = Math.max(maxZScore, z);
    if (z > model.zScoreThreshold) anomalyFeatures.push(`feature_${i}_zscore`);

    // IQR
    const iqr = model.q3s[i] - model.q1s[i];
    if (iqr > 0) {
      const lower = model.q1s[i] - model.iqrThreshold * iqr;
      const upper = model.q3s[i] + model.iqrThreshold * iqr;
      const iqrScore = val < lower ? (lower - val) / iqr : val > upper ? (val - upper) / iqr : 0;
      maxIQRScore = Math.max(maxIQRScore, iqrScore);
      if (iqrScore > 0) anomalyFeatures.push(`feature_${i}_iqr`);
    }

    // Modified Z-score using MAD
    const madScore = model.mads[i] > 0 ? Math.abs((val - model.medians[i]) / (1.4826 * model.mads[i])) : 0;
    maxMADScore = Math.max(maxMADScore, madScore);
    if (madScore > model.madThreshold) anomalyFeatures.push(`feature_${i}_mad`);
  }

  // Combined score: normalized to 0-1
  const zNorm = Math.min(1, maxZScore / model.zScoreThreshold);
  const iqrNorm = Math.min(1, maxIQRScore / model.iqrThreshold);
  const madNorm = Math.min(1, maxMADScore / model.madThreshold);

  const combinedScore = (zNorm + iqrNorm + madNorm) / 3;
  const isAnomaly = combinedScore > 0.5;

  return { zScore: maxZScore, iqrScore: maxIQRScore, madScore: maxMADScore, combinedScore, isAnomaly, anomalyFeatures };
}