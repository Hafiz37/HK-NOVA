import { describe, it, expect, beforeEach } from 'vitest';
import {
  LocalOutlierFactor,
  buildStatisticalModel,
  scoreStatistical,
  DBSCAN,
  EnsembleEngine,
  createEnsembleEngine,
} from '@/lib/algorithms';

describe('LocalOutlierFactor (LOF)', () => {
  let lof: LocalOutlierFactor;
  const trainData = [
    [1, 2], [1.1, 2.1], [0.9, 1.9], [1.05, 2.05],  // Normal cluster
    [10, 20], [11, 21], [9, 19],                    // Outlier cluster
  ];

  beforeEach(() => {
    lof = new LocalOutlierFactor({ k: 3 });
    lof.fit(trainData);
  });

  it('should detect normal points as non-anomalous', () => {
    const result = lof.predictPoint([1, 2]);
    expect(result.isAnomaly).toBe(false);
    expect(result.normalizedScore).toBeLessThan(0.5);
  });

  it('should detect outliers as anomalous', () => {
    const result = lof.predictPoint([10, 20]);
    expect(result.isAnomaly).toBe(true);
    expect(result.normalizedScore).toBeGreaterThan(0.5);
  });

  it('should return LOF score around 1 for normal points', () => {
    const result = lof.predictPoint([1, 2]);
    expect(result.lofScore).toBeCloseTo(1, 1);
  });

  it('should return high LOF score for outliers', () => {
    const result = lof.predictPoint([100, 200]);
    expect(result.lofScore).toBeGreaterThan(1.5);
  });
});

describe('Statistical Anomaly Detection', () => {
  const trainData = [
    [10, 20, 30], [11, 21, 31], [9, 19, 29], [10.5, 20.5, 30.5],
    [9.5, 19.5, 29.5], [10.2, 20.2, 30.2], [9.8, 19.8, 29.8],
  ];

  let model: ReturnType<typeof buildStatisticalModel>;

  beforeEach(() => {
    model = buildStatisticalModel(trainData);
  });

  it('should compute correct statistics', () => {
    expect(model.means.length).toBe(3);
    expect(model.stds.length).toBe(3);
    expect(model.medians.length).toBe(3);
    expect(model.mads.length).toBe(3);
  });

  it('should score normal points low', () => {
    const result = scoreStatistical(model, [10, 20, 30]);
    expect(result.isAnomaly).toBe(false);
    expect(result.combinedScore).toBeLessThan(0.5);
  });

  it('should score extreme outliers high', () => {
    const result = scoreStatistical(model, [100, 200, 300]);
    expect(result.isAnomaly).toBe(true);
    expect(result.combinedScore).toBeGreaterThan(0.5);
    expect(result.zScore).toBeGreaterThan(3);
  });

  it('should identify which features are anomalous', () => {
    const result = scoreStatistical(model, [100, 20, 30]);
    expect(result.anomalyFeatures).toContain('feature_0_zscore');
    expect(result.anomalyFeatures).toContain('feature_0_iqr');
    expect(result.anomalyFeatures).toContain('feature_0_mad');
  });

  it('should handle MAD-based detection for skewed data', () => {
    // Data with one feature having very small MAD
    const skewedData = [
      [1, 100], [1, 101], [1, 99], [1, 100.5], [1, 99.5],
      [10, 100], // outlier in first feature
    ];
    const skewedModel = buildStatisticalModel(skewedData);
    const result = scoreStatistical(skewedModel, [10, 100]);
    expect(result.isAnomaly).toBe(true);
    expect(result.madScore).toBeGreaterThan(3.5);
  });
});

describe('DBSCAN Clustering', () => {
  const trainData = [
    [1, 2], [1.1, 2.1], [0.9, 1.9], [1.05, 2.05],  // Cluster 1
    [10, 20], [11, 21], [9, 19], [10.5, 20.5],     // Cluster 2
    [100, 200],                                      // Noise/outlier
  ];

  let dbscan: DBSCAN;

  beforeEach(() => {
    dbscan = new DBSCAN({ eps: 1.5, minPts: 3, scaleFeatures: true });
    dbscan.fit(trainData);
  });

  it('should assign points to clusters', () => {
    const result = dbscan.predict([1, 2]);
    expect(result.isAnomaly).toBe(false);
    expect(result.cluster).toBeGreaterThanOrEqual(0);
  });

  it('should detect outliers as anomalies', () => {
    const result = dbscan.predict([100, 200]);
    expect(result.isAnomaly).toBe(true);
    expect(result.cluster).toBe(-1);
  });

  it('should return distance-based score for cluster members', () => {
    const result = dbscan.predict([1.1, 2.1]);
    expect(result.score).toBeLessThan(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe('Ensemble Engine', () => {
  let ensemble: EnsembleEngine;
  const trainData = [
    // Normal cluster
    ...Array.from({ length: 20 }, (_, i) => [
      10 + (Math.random() - 0.5) * 2,
      20 + (Math.random() - 0.5) * 2,
      30 + (Math.random() - 0.5) * 2,
    ]),
    // Anomalous cluster
    ...Array.from({ length: 5 }, (_, i) => [
      100 + Math.random() * 10,
      200 + Math.random() * 10,
      300 + Math.random() * 10,
    ]),
  ];
  const featureNames = ['latency', 'cpu', 'memory'];

  beforeEach(() => {
    ensemble = createEnsembleEngine();
  });

  it('should train all sub-algorithms', async () => {
    await ensemble.train('test-device', trainData, featureNames);
    const models = ensemble.getModels();
    expect(models.isolationForest).not.toBeNull();
    expect(models.lof).not.toBeNull();
    expect(models.statistical).not.toBeNull();
    expect(models.dbscan).not.toBeNull();
  });

  it('should predict with weighted voting', async () => {
    await ensemble.train('test-device', trainData, featureNames);

    // Normal point
    const normalResult = ensemble.predict([10, 20, 30]);
    expect(normalResult.algorithms.length).toBeGreaterThan(0);
    expect(normalResult.finalScore).toBeLessThan(0.5);

    // Anomalous point
    const anomalyResult = ensemble.predict([100, 200, 300]);
    expect(anomalyResult.finalScore).toBeGreaterThan(0.5);
    expect(anomalyResult.isAnomaly).toBe(true);
  });

  it('should provide feature contribution explanations', async () => {
    await ensemble.train('test-device', trainData, featureNames);
    const result = ensemble.predict([100, 200, 300]);
    expect(result.explanation).toBeDefined();
    expect(result.explanation!.length).toBeGreaterThan(0);
    expect(result.explanation![0]).toHaveProperty('featureName');
    expect(result.explanation![0]).toHaveProperty('contribution');
    expect(result.explanation![0]).toHaveProperty('severity');
  });

  it('should compute confidence based on agreement', async () => {
    await ensemble.train('test-device', trainData, featureNames);

    // Clear anomaly should have high confidence
    const anomalyResult = ensemble.predict([100, 200, 300]);
    expect(anomalyResult.confidence).toBeGreaterThan(0.5);

    // Ambiguous point should have lower confidence
    const ambiguousResult = ensemble.predict([15, 25, 35]);
    expect(ambiguousResult.confidence).toBeLessThanOrEqual(anomalyResult.confidence);
  });
});

describe('Integration: Full Pipeline', () => {
  it('should handle complete anomaly detection flow', async () => {
    // Generate synthetic training data
    const normalData = Array.from({ length: 100 }, () => ({
      latency: 50 + Math.random() * 20,
      cpu: 30 + Math.random() * 20,
      memory: 40 + Math.random() * 15,
      ifInOctets: 1000 + Math.random() * 500,
      ifOutOctets: 800 + Math.random() * 400,
    }));

    const trainData = normalData.map(d => [
      d.latency, d.cpu, d.memory, d.ifInOctets, d.ifOutOctets,
    ]);
    const featureNames = ['latency', 'cpu', 'memory', 'ifInOctets', 'ifOutOctets'];

    const ensemble = createEnsembleEngine();
    await ensemble.train('device-1', trainData, featureNames);

    // Test normal
    const normalResult = ensemble.predict([55, 35, 45, 1200, 1000]);
    expect(normalResult.severity).toMatch(/LOW|MEDIUM/);

    // Test anomaly
    const anomalyResult = ensemble.predict([500, 95, 90, 5000, 4000]);
    expect(anomalyResult.severity).toMatch(/HIGH|CRITICAL/);
    expect(anomalyResult.confidence).toBeGreaterThan(0);
  });
});