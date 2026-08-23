import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  extractAdvancedFeatures,
  trainModel,
  getOrTrainModel,
  scoreMetric,
  classifySeverity,
  saveAnomaly,
  extractLatestFeatures,
} from '@/lib/anomaly-service';
import { EnsembleEngine, createEnsembleEngine } from '@/lib/algorithms';
import { createCorrelationEngine } from '@/lib/algorithms';
import { createForecastModel, trainForecastModel, predictRisk } from '@/lib/algorithms';
import { createAutoTuner, runWeeklyAutoTune } from '@/lib/algorithms';

const prisma = new PrismaClient();

// Test device ID - will be created/cleaned up
let testDeviceId: string;

beforeAll(async () => {
  // Create a test device
  const device = await prisma.device.create({
    data: {
      name: 'test-ml-device',
      ip: '10.0.0.99',
      type: 'ROUTER',
      status: 'UP',
    },
  });
  testDeviceId = device.id;

  // Generate synthetic historical metrics (7 days worth)
  const now = new Date();
  const metrics: Array<{
    deviceId: string;
    timestamp: Date;
    metricType: string;
    latency?: number;
    cpuUtil?: number;
    memUtil?: number;
    interfaceData?: Array<{ inOctets: number; outOctets: number }>;
  }> = [];

  for (let day = 6; day >= 0; day--) {
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        const ts = new Date(now);
        ts.setDate(ts.getDate() - day);
        ts.setHours(hour, minute, 0, 0);

        // ICMP metric
        metrics.push({
          deviceId: testDeviceId,
          timestamp: ts,
          metricType: 'icmp',
          latency: 20 + Math.random() * 30,
        });

        // SNMP metric
        metrics.push({
          deviceId: testDeviceId,
          timestamp: ts,
          metricType: 'snmp',
          cpuUtil: 30 + Math.random() * 40,
          memUtil: 40 + Math.random() * 20,
          interfaceData: [
            {
              inOctets: Math.floor(1000 + Math.random() * 5000),
              outOctets: Math.floor(800 + Math.random() * 4000),
            },
          ],
        });
      }
    }
  }

  await prisma.metric.createMany({ data: metrics });
});

afterAll(async () => {
  // Cleanup
  await prisma.metric.deleteMany({ where: { deviceId: testDeviceId } });
  await prisma.anomaly.deleteMany({ where: { deviceId: testDeviceId } });
  await prisma.anomalyModel.deleteMany({ where: { deviceId: testDeviceId } });
  await prisma.device.delete({ where: { id: testDeviceId } });
  await prisma.$disconnect();
});

describe('Integration: Anomaly Service', () => {
  it('should extract advanced features from historical data', async () => {
    const { vectors, featureNames } = await extractAdvancedFeatures(prisma, testDeviceId, 7);
    expect(vectors.length).toBeGreaterThan(100); // ~2016 buckets for 7 days at 5min
    expect(featureNames.length).toBe(33);
    expect(vectors[0].features.length).toBe(33);
  });

  it('should train Isolation Forest model and persist to DB', async () => {
    const model = await trainModel(prisma, testDeviceId);
    expect(model).not.toBeNull();
    expect(model!.forest).toBeDefined();
    expect(model!.featureNames.length).toBe(33);
    expect(model!.scoreStats.p99).toBeGreaterThan(0);

    // Verify model persisted
    const dbModel = await prisma.anomalyModel.findFirst({
      where: { deviceId: testDeviceId, isActive: true },
    });
    expect(dbModel).not.toBeNull();
  });

  it('should load persisted model on subsequent calls', async () => {
    const model1 = await getOrTrainModel(prisma, testDeviceId);
    const model2 = await getOrTrainModel(prisma, testDeviceId);
    expect(model1).toBeDefined();
    expect(model2).toBeDefined();
    // Should be same model (cached)
    expect(model1!.trainedAt.getTime()).toBe(model2!.trainedAt.getTime());
  });

  it('should score new metrics and classify severity', async () => {
    const model = await getOrTrainModel(prisma, testDeviceId);
    expect(model).not.toBeNull();

    // Normal metric
    const normalFeatures = [
      25,  // latency
      35,  // cpu
      45,  // memory
      2000, // inOctets
      1500, // outOctets
      14, 3, 0, 1, 0, 1, // temporal
      0, 0, 0, 0, 0, // deltas
      25, 5, 35, 8, 45, 6, 2000, 1500, 30, 20, // rolling stats
      0, 0, 50, 0, 1, // network
      1, 50, // device context
    ];

    const score = scoreMetric(model!, normalFeatures);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);

    const severity = classifySeverity(score, model);
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(severity);
  });

  it('should save anomaly to database', async () => {
    const anomaly = await saveAnomaly(
      prisma,
      testDeviceId,
      'cpu',
      0.85,
      'HIGH',
      new Date()
    );
    expect(anomaly.id).toBeDefined();
    expect(anomaly.anomalyScore).toBe(0.85);
    expect(anomaly.severity).toBe('HIGH');
  });

  it('should extract latest features for real-time scoring', async () => {
    // Add recent metric
    await prisma.metric.create({
      data: {
        deviceId: testDeviceId,
        timestamp: new Date(),
        metricType: 'snmp',
        cpuUtil: 85,
        memUtil: 60,
        interfaceData: [{ inOctets: 5000, outOctets: 4000 }],
      },
    });

    const latest = await extractLatestFeatures(prisma, testDeviceId);
    expect(latest).not.toBeNull();
    expect(latest!.metricType).toBe('cpu');
    expect(latest!.features[1]).toBe(85); // cpu
  });
});

describe('Integration: Ensemble Engine', () => {
  it('should train ensemble and make predictions', async () => {
    const ensemble = createEnsembleEngine();
    const { vectors, featureNames } = await extractAdvancedFeatures(prisma, testDeviceId, 7);
    const trainData: number[][] = vectors.map(v => v.features);

    await ensemble.train(testDeviceId, trainData, featureNames);

    const normalResult = ensemble.predict(trainData[0]);
    expect(normalResult.algorithms.length).toBe(4); // IF, LOF, Statistical, DBSCAN
    expect(normalResult.finalScore).toBeLessThan(0.7);

    // Inject anomaly
    const anomalyFeatures = trainData[0].map((v: number, i: number) => i < 3 ? v * 10 : v);
    const anomalyResult = ensemble.predict(anomalyFeatures);
    expect(anomalyResult.finalScore).toBeGreaterThan(0.5);
    expect(anomalyResult.explanation).toBeDefined();
  });
});

describe('Integration: Correlation Engine', () => {
  it('should analyze correlations and discover patterns', async () => {
    // Create second test device
    const device2 = await prisma.device.create({
      data: { name: 'test-device-2', ip: '10.0.0.98', type: 'SWITCH', status: 'UP' },
    });

    // Add some anomalies for both devices
    const now = new Date();
    await prisma.anomaly.createMany({
      data: [
        { deviceId: testDeviceId, metricType: 'cpu', anomalyScore: 0.9, severity: 'HIGH', timestamp: new Date(now.getTime() - 10 * 60 * 1000) },
        { deviceId: device2.id, metricType: 'cpu', anomalyScore: 0.88, severity: 'HIGH', timestamp: new Date(now.getTime() - 5 * 60 * 1000) },
        { deviceId: testDeviceId, metricType: 'memory', anomalyScore: 0.92, severity: 'CRITICAL', timestamp: new Date(now.getTime() - 15 * 60 * 1000) },
        { deviceId: device2.id, metricType: 'memory', anomalyScore: 0.85, severity: 'HIGH', timestamp: new Date(now.getTime() - 20 * 60 * 1000) },
      ],
    });

    const engine = createCorrelationEngine(prisma);
    const result = await engine.analyzeCorrelations(1);

    expect(result.correlations.length).toBeGreaterThan(0);
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.graph.nodes.length).toBe(2);

    // Cleanup
    await prisma.anomaly.deleteMany({ where: { deviceId: device2.id } });
    await prisma.device.delete({ where: { id: device2.id } });
  });
});

describe('Integration: Risk Forecasting', () => {
  it('should train forecasting model and predict risk', async () => {
    const forecastModel = createForecastModel({ horizonMinutes: 60, epochs: 10 });
    await trainForecastModel(forecastModel, prisma, testDeviceId, 60);

    expect(forecastModel.isTrained).toBe(true);
    expect(forecastModel.performance).toBeDefined();
    expect(forecastModel.performance!.accuracy).toBeGreaterThan(0.5);

    const prediction = await predictRisk(forecastModel, prisma, testDeviceId, 60);
    expect(prediction).not.toBeNull();
    expect(prediction!.riskScore).toBeGreaterThanOrEqual(0);
    expect(prediction!.riskScore).toBeLessThanOrEqual(1);
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(prediction!.riskLevel);
    expect(prediction!.contributingFactors.length).toBeGreaterThan(0);
  });
});

describe('Integration: Auto-Tuning', () => {
  it('should run hyperparameter tuning', async () => {
    const tuner = createAutoTuner(prisma, undefined, {
      metric: 'f1',
      maxTrials: 5,
      timeoutMinutes: 2,
      cvFolds: 2,
    });

    const result = await tuner.tune(testDeviceId);
    expect(result.bestScore).toBeGreaterThan(0);
    expect(result.allTrials.length).toBeGreaterThan(0);
    expect(result.bestParams).toBeDefined();
    expect(result.bestParams.isolationForest.nTrees).toBeGreaterThan(0);
  });
});