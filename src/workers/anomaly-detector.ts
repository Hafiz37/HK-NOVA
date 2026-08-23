/**
 * Anomaly Detector Worker
 * ML-based anomaly detection (Isolation Forest) yang dilatih dari data historis.
 * Berjalan sesuai cron `ANOMALY_POLL_INTERVAL` dan melakukan scoring terhadap
 * metrics terbaru. Anomali HIGH/CRITICAL otomatis membuat Alert + notifikasi.
 */

import cron from 'node-cron';
import { PrismaClient, Prisma } from '@prisma/client';
import { ANOMALY_POLL_INTERVAL, ANOMALY_ALERT_COOLDOWN_MS } from '../lib/constants';
import {
  getOrTrainModel,
  extractLatestFeatures,
  scoreMetric,
  classifySeverity,
  saveAnomaly,
  trainEnsembleModels,
  predictWithEnsemble,
  formatExplanation,
  EnsembleEngine,
  TrainedModel,
} from '../lib/anomaly-service';
import { processAnomalyAlert, resolveAnomalyAlert } from '../lib/alert-engine';
import { dispatchNotifications } from '../lib/notifier';
import { isDeviceInMaintenance } from '../lib/maintenance';

// ─── Prisma singleton for worker process ────────────────────────────────────
const prisma = new PrismaClient();

// ─── Logging helper ──────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [ANOMALY-WORKER] [${level}] ${message}${metaStr}`);
}

// ─── In-memory model cache ───────────────────────────────────────────────────
const modelCache = new Map<string, TrainedModel>();
const ensembleCache = new Map<string, EnsembleEngine>();

async function getActiveDevices() {
  return prisma.device.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, ip: true, type: true },
  });
}

async function ensureModel(deviceId: string): Promise<{ model: TrainedModel; ensemble: EnsembleEngine } | null> {
  const cached = modelCache.get(deviceId);
  const cachedEnsemble = ensembleCache.get(deviceId);
  if (cached && cachedEnsemble) {
    const ageHours = (Date.now() - cached.trainedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < 24) {
      return { model: cached, ensemble: cachedEnsemble };
    }
  }

  log('INFO', `Loading/Training ensemble for device ${deviceId}...`);
  const trained = await trainEnsembleModels(prisma, deviceId);
  if (trained) {
    modelCache.set(deviceId, trained.ensemble.getModels().isolationForest!);
    ensembleCache.set(deviceId, trained.ensemble);
    log('INFO', `Ensemble ready for device ${deviceId}`);
    return { model: trained.ensemble.getModels().isolationForest!, ensemble: trained.ensemble };
  } else {
    log('WARN', `Failed to load/train ensemble for device ${deviceId} (insufficient data)`);
    return null;
  }
}

async function processDevice(device: { id: string; name: string; ip: string; type: string }) {
  try {
    const inMaintenance = await isDeviceInMaintenance(device.id, new Date());
    if (inMaintenance) {
      log('INFO', `Skipping ${device.name} — under maintenance window`);
      return;
    }

    const trained = await ensureModel(device.id);
    if (!trained) {
      return;
    }

    const latest = await extractLatestFeatures(prisma, device.id);
    if (!latest) {
      return;
    }

    // Use ensemble prediction
    const { result } = await predictWithEnsemble(trained.ensemble, latest.features);
    const score = result.finalScore;
    const severity = result.severity;

    if (severity === 'LOW' || severity === 'MEDIUM') {
      await resolveAnomalyAlert(prisma, device.id, latest.metricType);
      return;
    }

    // Format explanation for storage
    const explanation = formatExplanation(result);

    const anomaly = await prisma.anomaly.create({
      data: {
        deviceId: device.id,
        metricType: latest.metricType,
        anomalyScore: score,
        severity,
        timestamp: latest.timestamp,
        explanation: {
          summary: explanation.summary,
          topContributors: explanation.topContributors as unknown as Prisma.InputJsonValue,
          recommendation: explanation.recommendation,
        },
        contributingFeatures: explanation.topContributors as unknown as Prisma.InputJsonValue,
        confidence: result.confidence,
        algorithmVotes: result.algorithms.reduce((acc, algo) => {
          acc[algo.algorithm] = { score: algo.score, isAnomaly: algo.isAnomaly };
          return acc;
        }, {} as Record<string, { score: number; isAnomaly: boolean }>),
      },
    });

    log(
      'INFO',
      `Anomaly detected: ${device.name} (${device.ip}) - ${latest.metricType} ` +
        `score=${score.toFixed(3)} severity=${severity} confidence=${result.confidence.toFixed(2)}`
    );

    const alertResult = await processAnomalyAlert(prisma, device, {
      id: anomaly.id,
      metricType: latest.metricType,
      anomalyScore: score,
      severity,
    });

    if (alertResult.created && alertResult.alert) {
      await dispatchNotifications(prisma, {
        type: 'ANOMALY_DETECTED',
        severity: alertResult.alert.severity,
        deviceId: device.id,
        deviceName: device.name,
        deviceIp: device.ip,
        message: alertResult.alert.message,
        cooldownMs: ANOMALY_ALERT_COOLDOWN_MS,
        alertId: alertResult.alert.id,
        valueSnapshot: { anomalyScore: score, metricType: latest.metricType },
      });

      log(
        'INFO',
        `Alert created & notification dispatched for ${device.name} (${latest.metricType})`
      );
    }
  } catch (err) {
    log('ERROR', `Error processing device ${device.id}`, err instanceof Error ? err.message : err);
  }
}

// ─── Main poll cycle ──────────────────────────────────────────────────────────
let cycleInProgress = false;

async function pollCycle(): Promise<void> {
  if (cycleInProgress) {
    log('WARN', 'Anomaly poll cycle already in progress — skipping scheduled run');
    return;
  }
  cycleInProgress = true;
  const cycleStart = Date.now();

  try {
    const devices = await getActiveDevices();
    log('INFO', `Processing ${devices.length} devices...`);

    for (const device of devices) {
      await processDevice(device);
    }

    const elapsed = Date.now() - cycleStart;
    log('INFO', `Poll cycle completed in ${elapsed}ms`);
  } catch (err) {
    log('ERROR', 'Poll cycle failed', err instanceof Error ? err.message : err);
  } finally {
    cycleInProgress = false;
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('INFO', `Received ${signal}, shutting down gracefully...`);

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

// ─── Startup ──────────────────────────────────────────────────────────────────
log('INFO', `Anomaly Detector starting with schedule: "${ANOMALY_POLL_INTERVAL}"`);
log('INFO', 'Model persistence and re-training enabled (24h window)');

// Run immediately on startup
void pollCycle();

cron.schedule(ANOMALY_POLL_INTERVAL, () => {
  if (!isShuttingDown) {
    void pollCycle();
  }
});

log('INFO', 'Anomaly Detector is running. Press Ctrl+C to stop.');