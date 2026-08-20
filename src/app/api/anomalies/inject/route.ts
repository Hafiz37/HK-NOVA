import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { trainModel, extractLatestFeatures, scoreMetric, classifySeverity, saveAnomaly } from '@/lib/anomaly-service';
import { processAnomalyAlert } from '@/lib/alert-engine';
import { dispatchNotifications } from '@/lib/notifier';
import { ANOMALY_ALERT_COOLDOWN_MS } from '@/lib/constants';

/**
 * POST /api/anomalies/inject — Inject synthetic anomaly untuk testing (admin only).
 * Body: { deviceId, metricType, value? }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const { deviceId, metricType, value } = body ?? {};

    if (!deviceId || !metricType) {
      return NextResponse.json({ error: 'deviceId and metricType required' }, { status: 400 });
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true, name: true, ip: true, type: true },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    let syntheticValue = value;
    if (syntheticValue == null) {
      if (metricType === 'cpu') syntheticValue = 250;
      else if (metricType === 'memory') syntheticValue = 250;
      else if (metricType === 'latency') syntheticValue = 2000;
      else syntheticValue = 2_000_000_000;
    }

    // Titik sintetis ekstrem pada semua dimensi (plus traffic tinggi) agar
    // anomali dijamin melampaui persentil tinggi model → alert HIGH/CRITICAL.
    const interfaceData = [
      {
        index: 1,
        name: 'synthetic',
        operStatus: 1,
        speed: 1000000000,
        inOctets: metricType === 'ifInOctets' ? syntheticValue : 2_000_000_000,
        outOctets: metricType === 'ifOutOctets' ? syntheticValue : 2_000_000_000,
        inErrors: 0,
        outErrors: 0,
      },
    ];

    await prisma.metric.create({
      data: {
        deviceId,
        metricType: 'SNMP',
        timestamp: new Date(),
        cpuUtil:
          metricType === 'cpu'
            ? syntheticValue
            : metricType === 'ifInOctets' || metricType === 'ifOutOctets'
              ? 95
              : null,
        memUtil:
          metricType === 'memory'
            ? syntheticValue
            : metricType === 'ifInOctets' || metricType === 'ifOutOctets'
              ? 92
              : null,
        latency: metricType === 'latency' ? syntheticValue : metricType === 'cpu' || metricType === 'memory' ? 300 : null,
        interfaceData: interfaceData as Prisma.InputJsonValue,
      },
    });

    const model = await trainModel(prisma, deviceId);
    if (!model) {
      return NextResponse.json(
        { error: 'Insufficient data to train model (need 7 days of metrics)' },
        { status: 400 }
      );
    }

    const latest = await extractLatestFeatures(prisma, deviceId, 1);
    if (!latest) {
      return NextResponse.json({ error: 'No recent metrics found' }, { status: 400 });
    }

    const score = scoreMetric(model, latest.features);
    const severity = classifySeverity(score, model);

    const anomaly = await saveAnomaly(prisma, deviceId, metricType, score, severity);

    let alert = null;
    if (severity === 'HIGH' || severity === 'CRITICAL') {
      const alertResult = await processAnomalyAlert(prisma, device, {
        id: anomaly.id,
        metricType,
        anomalyScore: score,
        severity,
      });

      if (alertResult.created && alertResult.alert) {
        alert = alertResult.alert;

        await dispatchNotifications(prisma, {
          type: 'ANOMALY_DETECTED',
          severity: alertResult.alert.severity,
          deviceId: device.id,
          deviceName: device.name,
          deviceIp: device.ip,
          message: alertResult.alert.message,
          cooldownMs: ANOMALY_ALERT_COOLDOWN_MS,
          alertId: alertResult.alert.id,
          valueSnapshot: { anomalyScore: score, metricType },
        });
      }
    }

    return NextResponse.json({
      message: 'Synthetic anomaly injected successfully',
      data: { anomaly, alert },
    });
  } catch (err) {
    console.error('[API /api/anomalies/inject POST] Error:', err);
    return NextResponse.json({ error: 'Gagal inject anomali' }, { status: 500 });
  }
}