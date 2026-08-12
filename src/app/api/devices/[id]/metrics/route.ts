import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/devices/[id]/metrics?hours=24&type=ICMP
 * Returns time-series metric history for a specific device.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const hours = Math.min(Number(searchParams.get('hours') ?? '24'), 168); // max 7 days
    const metricType = searchParams.get('type') ?? 'ICMP';

    // Validate device exists
    const device = await prisma.device.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, ip: true, status: true },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const metrics = await prisma.metric.findMany({
      where: {
        deviceId: id,
        metricType,
        timestamp: { gte: since },
      },
      select: {
        id: true,
        timestamp: true,
        metricType: true,
        latency: true,
        packetLoss: true,
        cpuUtil: true,
        memUtil: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    // Compute summary statistics
    const icmpMetrics = metrics.filter((m) => m.latency !== null);
    const avgLatency =
      icmpMetrics.length > 0
        ? icmpMetrics.reduce((sum, m) => sum + (m.latency ?? 0), 0) / icmpMetrics.length
        : null;
    const maxLatency =
      icmpMetrics.length > 0 ? Math.max(...icmpMetrics.map((m) => m.latency ?? 0)) : null;
    const minLatency =
      icmpMetrics.length > 0 ? Math.min(...icmpMetrics.map((m) => m.latency ?? 0)) : null;
    const avgPacketLoss =
      metrics.length > 0
        ? metrics.reduce((sum, m) => sum + (m.packetLoss ?? 0), 0) / metrics.length
        : null;

    return NextResponse.json({
      device: { id: device.id, name: device.name, ip: device.ip, status: device.status },
      metricType,
      period: { hours, since: since.toISOString() },
      summary: { avgLatency, maxLatency, minLatency, avgPacketLoss, dataPoints: metrics.length },
      data: metrics,
    });
  } catch (error) {
    console.error('[API /api/devices/[id]/metrics] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
