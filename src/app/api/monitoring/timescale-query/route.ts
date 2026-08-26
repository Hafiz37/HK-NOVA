import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { CONTINUOUS_AGGREGATE_QUERIES, getOptimizedQuery } from '@/lib/timescale';
import { parsePositiveNumberParam } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/monitoring/timescale-query?deviceId=xyz&metricType=ICMP&hours=24
 * Queries continuous aggregates for optimized time-series data.
 * Automatically selects the appropriate aggregate view based on time range.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const metricType = searchParams.get('metricType') || 'ICMP';
    const hours = parsePositiveNumberParam(searchParams.get('hours'), 24, 1, 720);

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Ensure view identifier is safely strictly whitelisted to prevent SQL injection
    const allowedViews = ['"Metric_1m"', '"Metric_5m"', '"Metric_1h"', '"Metric_1d"'];
    const rawView = CONTINUOUS_AGGREGATE_QUERIES.getAggregateView(hours);
    const view = allowedViews.includes(rawView) ? rawView : '"Metric_5m"';

    const query = `
      SELECT bucket as timestamp,
             avg_latency as latency,
             max_latency,
             min_latency,
             avg_packet_loss as "packetLoss",
             max_packet_loss,
             avg_cpu as "cpuUtil",
             max_cpu,
             avg_mem as "memUtil",
             max_mem,
             sample_count
      FROM ${view}
      WHERE "deviceId" = $1
        AND "metricType" = $2
        AND bucket >= NOW() - INTERVAL '${hours} hours'
      ORDER BY bucket ASC
    `;

    const results = await prisma.$queryRawUnsafe<Array<{
      timestamp: Date;
      latency: number | null;
      max_latency: number | null;
      min_latency: number | null;
      packetLoss: number | null;
      max_packet_loss: number | null;
      cpuUtil: number | null;
      max_cpu: number | null;
      memUtil: number | null;
      max_mem: number | null;
      sample_count: number;
    }>>(query, deviceId, metricType);

    return NextResponse.json({
      device,
      metricType,
      hours,
      aggregateView: view,
      dataPoints: results.length,
      data: results.map((r) => ({
        timestamp: r.timestamp.toISOString(),
        latency: r.latency,
        maxLatency: r.max_latency,
        minLatency: r.min_latency,
        packetLoss: r.packetLoss,
        maxPacketLoss: r.max_packet_loss,
        cpuUtil: r.cpuUtil,
        maxCpu: r.max_cpu,
        memUtil: r.memUtil,
        maxMem: r.max_mem,
        samples: r.sample_count,
      })),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /api/monitoring/timescale-query] Error:', error);
    return NextResponse.json({ error: 'Failed to query continuous aggregates' }, { status: 500 });
  }
}