/**
 * Advanced ML Worker
 * Handles LSTM training, risk forecasting, correlation analysis, and auto-tuning
 * Runs on a slower schedule (hourly/daily) than the main anomaly detector
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { createLSTMModel, trainLSTM, predictLSTM, disposeLSTMModel, LSTMModel } from '../lib/algorithms';
import { createCorrelationEngine, CorrelationEngine } from '../lib/algorithms';
import { createForecastModel, trainForecastModel, predictRisk, disposeForecastModel, ForecastModel } from '../lib/algorithms';
import { createAutoTuner, runWeeklyAutoTune } from '../lib/algorithms';
import { extractAdvancedFeatures } from '../lib/feature-engineering';

const prisma = new PrismaClient();

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [ADVANCED-ML-WORKER] [${level}] ${message}${metaStr}`);
}

// ─── Caches ─────────────────────────────────────────────────────────────────────
const lstmCache = new Map<string, LSTMModel>();
const forecastCache = new Map<string, ForecastModel>();

async function getDevicesWithSufficientData(minSamples = 200): Promise<string[]> {
  const devices = await prisma.device.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  const validDevices: string[] = [];
  for (const device of devices) {
    const { vectors } = await extractAdvancedFeatures(prisma, device.id, 7);
    if (vectors.length >= minSamples) {
      validDevices.push(device.id);
    }
  }
  return validDevices;
}

// ─── LSTM Training (Every 6 hours) ──────────────────────────────────────────────
async function trainLSTMModels(): Promise<void> {
  log('INFO', 'Starting LSTM model training cycle...');
  const deviceIds = await getDevicesWithSufficientData(300); // Need more data for LSTM

  for (const deviceId of deviceIds) {
    try {
      const { vectors, featureNames } = await extractAdvancedFeatures(prisma, deviceId, 7);
      const trainData = vectors.map(v => v.features);

      if (trainData.length < 100) continue;

      const lstmModel = createLSTMModel({
        lookbackWindow: 60,
        horizon: 12,
        epochs: 20,
        batchSize: 32,
      });

      await trainLSTM(lstmModel, trainData, featureNames);
      lstmCache.set(deviceId, lstmModel);
      log('INFO', `LSTM trained for device ${deviceId} (${trainData.length} samples)`);
    } catch (err) {
      log('ERROR', `LSTM training failed for ${deviceId}`, err instanceof Error ? err.message : err);
    }
  }
  log('INFO', 'LSTM training cycle completed');
}

// ─── Risk Forecasting (Every 30 minutes) ────────────────────────────────────────
async function runRiskForecasting(): Promise<void> {
  log('INFO', 'Starting risk forecasting cycle...');
  const deviceIds = await getDevicesWithSufficientData(200);

  for (const deviceId of deviceIds) {
    try {
      let forecastModel = forecastCache.get(deviceId);
      if (!forecastModel) {
        forecastModel = createForecastModel({ horizonMinutes: 60 });
        forecastCache.set(deviceId, forecastModel);
      }

      const prediction = await predictRisk(forecastModel, prisma, deviceId, 60);

      if (prediction && (prediction.riskLevel === 'HIGH' || prediction.riskLevel === 'CRITICAL')) {
        // Store risk prediction
        await prisma.anomalyRiskPrediction.create({
          data: {
            deviceId,
            riskScore: prediction.riskScore,
            riskLevel: prediction.riskLevel,
            predictedAt: new Date(),
            horizon: 60,
          },
        });

        // Dispatch notification for high risk
        const device = await prisma.device.findUnique({
          where: { id: deviceId },
          select: { name: true, ip: true },
        });

        if (device) {
          log('WARN', `HIGH RISK PREDICTION: ${device.name} (${device.ip}) - ${prediction.riskLevel} (score: ${prediction.riskScore.toFixed(3)})`);
          // Could dispatch notification here
        }
      }
    } catch (err) {
      log('ERROR', `Risk forecasting failed for ${deviceId}`, err instanceof Error ? err.message : err);
    }
  }
  log('INFO', 'Risk forecasting cycle completed');
}

// ─── Correlation Analysis (Every 2 hours) ───────────────────────────────────────
async function runCorrelationAnalysis(): Promise<void> {
  log('INFO', 'Starting correlation analysis...');
  try {
    const engine = createCorrelationEngine(prisma);
    const result = await engine.analyzeCorrelations(24); // Last 24 hours

    log('INFO', `Correlation analysis: ${result.correlations.length} correlations, ${result.patterns.length} patterns found`);

    // Log interesting patterns
    for (const pattern of result.patterns.slice(0, 5)) {
      log('INFO', `Pattern: ${pattern.pattern} (confidence: ${pattern.confidence.toFixed(2)}, support: ${pattern.support.toFixed(2)})`);
    }
  } catch (err) {
    log('ERROR', 'Correlation analysis failed', err instanceof Error ? err.message : err);
  }
}

// ─── Auto-tuning (Weekly, Sunday 3 AM) ──────────────────────────────────────────
async function runAutoTuning(): Promise<void> {
  log('INFO', 'Starting weekly auto-tuning...');
  try {
    await runWeeklyAutoTune(prisma);
    log('INFO', 'Auto-tuning completed');
  } catch (err) {
    log('ERROR', 'Auto-tuning failed', err instanceof Error ? err.message : err);
  }
}

// ─── Cleanup (Daily) ────────────────────────────────────────────────────────────
async function runCleanup(): Promise<void> {
  log('INFO', 'Running cleanup...');
  try {
    // Clean old risk predictions (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.anomalyRiskPrediction.deleteMany({
      where: { predictedAt: { lt: sevenDaysAgo } },
    });
    log('INFO', `Cleaned up ${deleted.count} old risk predictions`);

    // Dispose unused models (older than 24h)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [deviceId, model] of lstmCache) {
      if (model.lastTrained && model.lastTrained.getTime() < dayAgo) {
        disposeLSTMModel(model);
        lstmCache.delete(deviceId);
      }
    }
    for (const [deviceId, model] of forecastCache) {
      if (model.lastTrained && model.lastTrained.getTime() < dayAgo) {
        disposeForecastModel(model);
        forecastCache.delete(deviceId);
      }
    }
    log('INFO', 'Model cache cleanup completed');
  } catch (err) {
    log('ERROR', 'Cleanup failed', err instanceof Error ? err.message : err);
  }
}

// ─── Schedules ──────────────────────────────────────────────────────────────────
log('INFO', 'Advanced ML Worker starting...');
log('INFO', 'Schedules:');
log('INFO', '  - LSTM Training: Every 6 hours (0 */6 * * *)');
log('INFO', '  - Risk Forecasting: Every 30 minutes (*/30 * * * *)');
log('INFO', '  - Correlation Analysis: Every 2 hours (0 */2 * * *)');
log('INFO', '  - Auto-tuning: Weekly Sunday 3 AM (0 3 * * 0)');
log('INFO', '  - Cleanup: Daily 4 AM (0 4 * * *)');

// Run once on startup
void trainLSTMModels();
void runRiskForecasting();
void runCorrelationAnalysis();
void runCleanup();

// Cron schedules
cron.schedule('0 */6 * * *', () => void trainLSTMModels());           // Every 6 hours
cron.schedule('*/30 * * * *', () => void runRiskForecasting());       // Every 30 min
cron.schedule('0 */2 * * *', () => void runCorrelationAnalysis());    // Every 2 hours
cron.schedule('0 3 * * 0', () => void runAutoTuning());               // Weekly Sunday 3 AM
cron.schedule('0 4 * * *', () => void runCleanup());                  // Daily 4 AM

// Graceful shutdown
let isShuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('INFO', `Received ${signal}, shutting down gracefully...`);

  // Dispose all models
  for (const [, model] of lstmCache) disposeLSTMModel(model);
  for (const [, model] of forecastCache) disposeForecastModel(model);
  lstmCache.clear();
  forecastCache.clear();

  try {
    await prisma.$disconnect();
    log('INFO', 'Prisma disconnected');
  } catch (err) {
    log('ERROR', 'Error during shutdown', err);
  }

  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

log('INFO', 'Advanced ML Worker is running. Press Ctrl+C to stop.');