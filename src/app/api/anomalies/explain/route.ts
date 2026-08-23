import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const anomalyId = searchParams.get('anomalyId');

    if (!anomalyId) {
      return NextResponse.json({ error: 'anomalyId is required' }, { status: 400 });
    }

    const anomaly = await prisma.anomaly.findUnique({
      where: { id: anomalyId },
      include: {
        device: { select: { id: true, name: true, ip: true, type: true, location: true } },
        feedback: { include: { user: { select: { id: true, username: true, fullName: true } } } },
      },
    });

    if (!anomaly) {
      return NextResponse.json({ error: 'Anomaly not found' }, { status: 404 });
    }

    // Get related anomalies (same device, similar time window)
    const timeWindow = 30 * 60 * 1000; // 30 minutes
    const relatedAnomalies = await prisma.anomaly.findMany({
      where: {
        deviceId: anomaly.deviceId,
        id: { not: anomalyId },
        timestamp: {
          gte: new Date(anomaly.timestamp.getTime() - timeWindow),
          lte: new Date(anomaly.timestamp.getTime() + timeWindow),
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    // Get historical anomaly score trend for this device + metric type
    const scoreHistory = await prisma.anomaly.findMany({
      where: {
        deviceId: anomaly.deviceId,
        metricType: anomaly.metricType,
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
      select: { anomalyScore: true, severity: true, timestamp: true },
    });

    return NextResponse.json({
      data: {
        anomaly: {
          ...anomaly,
          explanation: anomaly.explanation,
          contributingFeatures: anomaly.contributingFeatures,
          confidence: anomaly.confidence,
          algorithmVotes: anomaly.algorithmVotes,
        },
        relatedAnomalies,
        scoreHistory,
        feedback: anomaly.feedback,
      },
    });
  } catch (err) {
    console.error('[API /api/anomalies/explain GET] Error:', err);
    return NextResponse.json({ error: 'Gagal mengambil penjelasan anomali' }, { status: 500 });
  }
}