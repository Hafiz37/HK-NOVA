import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { parsePositiveIntParam } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface DataPoint {
  x: number; // timestamp in ms
  y: number; // metric value
}

function linearRegression(data: DataPoint[]) {
  const n = data.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const point of data) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumXX += point.x * point.x;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared (coefficient of determination)
  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;

  for (const point of data) {
    const yPred = slope * point.x + intercept;
    ssTot += (point.y - yMean) ** 2;
    ssRes += (point.y - yPred) ** 2;
  }

  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2 };
}

/**
 * GET /api/monitoring/forecast?deviceId=xyz&metric=cpu&days=7
 * Forecasts metric values for the next N days using historical linear trend.
 * Predicts when thresholds (85%, 95%) will be breached.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const metric = searchParams.get('metric') ?? 'cpu'; // 'cpu' | 'mem' | 'latency'
    const daysAhead = parsePositiveIntParam(searchParams.get('days'), 7, 1, 30);
    const lookbackDays = parsePositiveIntParam(searchParams.get('lookback'), 14, 1, 90);

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId, deletedAt: null },
      select: { id: true, name: true, ip: true },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const metricType = metric === 'latency' ? 'ICMP' : 'SNMP';
    const column = metric === 'latency' ? 'latency' : metric === 'cpu' ? 'cpuUtil' : 'memUtil';

    const metrics = await prisma.metric.findMany({
      where: {
        deviceId,
        metricType,
        timestamp: { gte: since },
      },
      select: { [column]: true, timestamp: true },
      orderBy: { timestamp: 'asc' },
    });

    const dataPoints: DataPoint[] = metrics
      .filter((m) => m[column] != null)
      .map((m) => ({
        x: new Date(m.timestamp).getTime(),
        y: Number(m[column]),
      }));

    if (dataPoints.length < 10) {
      return NextResponse.json({
        device,
        metric,
        insufficientData: true,
        message: 'Insufficient historical data points for accurate forecasting (minimum 10 required)',
      });
    }

    const { slope, intercept, r2 } = linearRegression(dataPoints);

    // Current value
    const lastPoint = dataPoints[dataPoints.length - 1]!;
    const currentValue = lastPoint.y;

    // Forecast points for future days
    const nowMs = Date.now();
    const futurePoints: Array<{ timestamp: string; predictedValue: number }> = [];
    const dayMs = 24 * 60 * 60 * 1000;

    for (let i = 1; i <= daysAhead; i++) {
      const futureMs = nowMs + i * dayMs;
      const predicted = Math.min(100, Math.max(0, slope * futureMs + intercept));
      futurePoints.push({
        timestamp: new Date(futureMs).toISOString(),
        predictedValue: Number(predicted.toFixed(2)),
      });
    }

    // Threshold breach estimation
    const warnThreshold = metric === 'latency' ? 100 : 85;
    const critThreshold = metric === 'latency' ? 200 : 95;

    let daysToWarn: number | null = null;
    let daysToCrit: number | null = null;

    if (slope > 0) {
      const msToWarn = (warnThreshold - intercept) / slope - nowMs;
      const msToCrit = (critThreshold - intercept) / slope - nowMs;

      if (msToWarn > 0) daysToWarn = Math.round(msToWarn / dayMs);
      if (msToCrit > 0) daysToCrit = Math.round(msToCrit / dayMs);
    }

    return NextResponse.json({
      device,
      metric,
      period: { lookbackDays, forecastDays: daysAhead },
      currentValue: Number(currentValue.toFixed(2)),
      trend: {
        direction: slope > 0.00000001 ? 'UP' : slope < -0.00000001 ? 'DOWN' : 'STABLE',
        slopePerDay: Number((slope * dayMs).toFixed(2)),
        confidenceR2: Number(r2.toFixed(2)),
      },
      capacityWarning: {
        daysToWarningThreshold: daysToWarn,
        daysToCriticalThreshold: daysToCrit,
        warningThreshold: warnThreshold,
        criticalThreshold: critThreshold,
      },
      forecast: futurePoints,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /api/monitoring/forecast] Error:', error);
    return NextResponse.json({ error: 'Failed to compute forecast' }, { status: 500 });
  }
}