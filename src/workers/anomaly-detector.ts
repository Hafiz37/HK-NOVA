/**
 * Anomaly Detector Worker
 * ML-based anomaly detection (Isolation Forest) yang dilatih dari data historis.
 * Berjalan sesuai cron `ANOMALY_POLL_INTERVAL` dan melakukan scoring terhadap
 * metrics terbaru. Anomali HIGH/CRITICAL otomatis membuat Alert + notifikasi.
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { ANOMALY_POLL_INTERVAL, ANOMALY_ALERT_COOLDOWN_MS } from '../lib/constants';
import {
  getOrTrainModel,
  extractLatestFeatures,
  scoreMetric,
  classifySeverity,
  saveAnomaly,
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

async function getActiveDevices() {
  return prisma.device.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, ip: true, type: true },
  });
}

async function ensureModel(deviceId: string): Promise<TrainedModel | null> {
  const cached = modelCache.get(deviceId);
  if (cached) {
    const ageHours = (Date.now() - cached.trainedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < 24) {
      return cached;
    }
  }

  log('INFO', `Loading/Training model for device ${deviceId}...`);
  const model = await getOrTrainModel(prisma, deviceId);
  if (model) {
    modelCache.set(deviceId, model);
    log('INFO', `Model ready for device ${deviceId} (trainedAt: ${model.trainedAt.toISOString()})`);
  } else {
    log('WARN', `Failed to load/train model for device ${deviceId} (insufficient data)`);
  }
  return model;
}

async function processDevice(device: { id: string; name: string; ip: string; type: string }) {
  try {
    const inMaintenance = await isDeviceInMaintenance(device.id, new Date());
    if (inMaintenance) {
      log('INFO', `Skipping ${device.name} — under maintenance window`);
      return;
    }

    const model = await ensureModel(device.id);
    if (!model) {
      return;
    }

    const latest = await extractLatestFeatures(prisma, device.id);
    if (!latest) {
      return;
    }

    const score = scoreMetric(model, latest.features);
    const severity = classifySeverity(score, model);

    if (severity === 'LOW' || severity === 'MEDIUM') {
      await resolveAnomalyAlert(prisma, device.id, latest.metricType);
      return;
    }

    const anomaly = await saveAnomaly(
      prisma,
      device.id,
      latest.metricType,
      score,
      severity,
      latest.timestamp
    );

    log(
      'INFO',
      `Anomaly detected: ${device.name} (${device.ip}) - ${latest.metricType} ` +
        `score=${score.toFixed(3)} severity=${severity}`
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