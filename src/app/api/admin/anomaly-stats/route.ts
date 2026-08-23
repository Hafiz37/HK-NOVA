import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession, requireRole } from '@/lib/auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const sinceHours = parseInt(searchParams.get('sinceHours') || '24');
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    // Parallel queries for performance
    const [
      totalAnomalies,
      anomaliesBySeverity,
      anomaliesByType,
      anomaliesByDevice,
      totalModels,
      modelsByType,
      recentModels,
      totalFeedback,
      feedbackByType,
      correlationPatterns,
      riskPredictions,
      riskByLevel,
    ] = await Promise.all([
      // Anomaly stats
      prisma.anomaly.count({ where: { timestamp: { gte: since } } }),
      prisma.anomaly.groupBy({
        by: ['severity'],
        where: { timestamp: { gte: since } },
        _count: true,
      }),
      prisma.anomaly.groupBy({
        by: ['metricType'],
        where: { timestamp: { gte: since } },
        _count: true,
      }),
      prisma.anomaly.groupBy({
        by: ['deviceId'],
        where: { timestamp: { gte: since } },
        _count: true,
        orderBy: { _count: { deviceId: 'desc' } },
        take: 10,
      }),
      // Model stats
      prisma.anomalyModel.count({ where: { isActive: true } }),
      prisma.anomalyModel.groupBy({
        by: ['deviceType'],
        where: { isActive: true },
        _count: true,
      }),
      prisma.anomalyModel.findMany({
        where: { isActive: true },
        orderBy: { trainedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          deviceId: true,
          deviceType: true,
          version: true,
          trainedAt: true,
          trainingSize: true,
          performance: true,
          hyperParams: true,
        },
      }),
      // Feedback stats
      prisma.anomalyFeedback.count({
        where: { createdAt: { gte: since } },
      }),
      prisma.anomalyFeedback.groupBy({
        by: ['feedback'],
        where: { createdAt: { gte: since } },
        _count: true,
      }),
      // Correlation stats
      prisma.correlationPattern.count(),
      // Risk prediction stats
      prisma.anomalyRiskPrediction.count({
        where: { predictedAt: { gte: since } },
      }),
      prisma.anomalyRiskPrediction.groupBy({
        by: ['riskLevel'],
        where: { predictedAt: { gte: since } },
        _count: true,
      }),
    ]);

    // Get device names for top devices
    const deviceIds = anomaliesByDevice.map(d => d.deviceId);
    const devices = await prisma.device.findMany({
      where: { id: { in: deviceIds } },
      select: { id: true, name: true, ip: true, type: true },
    });
    const deviceMap = new Map(devices.map(d => [d.id, d]));

    // Calculate rates
    const falsePositiveRate = totalFeedback > 0
      ? (feedbackByType.find(f => f.feedback === 'FALSE_POSITIVE')?._count || 0) / totalFeedback
      : 0;

    const truePositiveRate = totalFeedback > 0
      ? (feedbackByType.find(f => f.feedback === 'TRUE_POSITIVE')?._count || 0) / totalFeedback
      : 0;

    // Time series: anomalies per hour for last 24h
    const hourlyAnomalies = await prisma.$queryRaw<Array<{ hour: Date; count: bigint }>>`
      SELECT DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') as hour, COUNT(*) as count
      FROM Anomaly
      WHERE timestamp >= ${since}
      GROUP BY hour
      ORDER BY hour ASC
    `;

    // Worker health (from logs or status)
    const workerStatus = {
      anomalyDetector: 'RUNNING', // Would be from actual worker monitoring
      advancedMlWorker: 'RUNNING',
    };

    return NextResponse.json({
      data: {
        summary: {
          totalAnomalies,
          anomaliesBySeverity: Object.fromEntries(
            anomaliesBySeverity.map(s => [s.severity, s._count])
          ),
          anomaliesByType: Object.fromEntries(
            anomaliesByType.map(t => [t.metricType, t._count])
          ),
          topDevices: anomaliesByDevice.map(d => ({
            deviceId: d.deviceId,
            name: deviceMap.get(d.deviceId)?.name || 'Unknown',
            ip: deviceMap.get(d.deviceId)?.ip || '',
            type: deviceMap.get(d.deviceId)?.type || '',
            count: d._count,
          })),
          falsePositiveRate: Math.round(falsePositiveRate * 10000) / 100,
          truePositiveRate: Math.round(truePositiveRate * 10000) / 100,
        },
        models: {
          totalActive: totalModels,
          byType: Object.fromEntries(modelsByType.map(m => [m.deviceType || 'UNKNOWN', m._count])),
          recent: recentModels.map(m => ({
            id: m.id,
            deviceId: m.deviceId,
            deviceType: m.deviceType,
            version: m.version,
            trainedAt: m.trainedAt,
            trainingSize: m.trainingSize,
            performance: m.performance,
            hyperParams: m.hyperParams,
          })),
        },
        feedback: {
          total: totalFeedback,
          byType: Object.fromEntries(
            feedbackByType.map(f => [f.feedback, f._count])
          ),
        },
        correlations: {
          totalPatterns: correlationPatterns,
        },
        risk: {
          totalPredictions: riskPredictions,
          byLevel: Object.fromEntries(
            riskByLevel.map(r => [r.riskLevel, r._count])
          ),
        },
        timeSeries: {
          hourly: hourlyAnomalies.map(h => ({
            hour: h.hour,
            count: Number(h.count),
          })),
        },
        workers: workerStatus,
        period: { sinceHours, since: since.toISOString() },
      },
    });
  } catch (err) {
    console.error('[API /api/admin/anomaly-stats GET] Error:', err);
    return NextResponse.json({ error: 'Gagal mengambil statistik anomali' }, { status: 500 });
  }
}