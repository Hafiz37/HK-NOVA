import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/devices/[id]/snmp-metrics?hours=24
 * Returns time-series SNMP metric history (CPU, memory, interfaces) for a device.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const hours = Math.min(Number(searchParams.get('hours') ?? '24'), 168); // max 7 days

    // Validate device exists
    const device = await prisma.device.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        ip: true,
        status: true,
        credentials: {
          select: {
            snmpVersion: true,
            snmpCommunity: true,
          },
        },
      },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const metrics = await prisma.metric.findMany({
      where: {
        deviceId: id,
        metricType: 'SNMP',
        timestamp: { gte: since },
      },
      select: {
        id: true,
        timestamp: true,
        cpuUtil: true,
        memUtil: true,
        interfaceData: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    // Compute summary statistics
    const cpuSamples  = metrics.filter((m) => m.cpuUtil  !== null).map((m) => m.cpuUtil  as number);
    const memSamples  = metrics.filter((m) => m.memUtil  !== null).map((m) => m.memUtil  as number);

    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const max = (arr: number[]) => arr.length ? Math.max(...arr) : null;
    const min = (arr: number[]) => arr.length ? Math.min(...arr) : null;

    const summary = {
      avgCpuUtil:  avg(cpuSamples),
      maxCpuUtil:  max(cpuSamples),
      minCpuUtil:  min(cpuSamples),
      avgMemUtil:  avg(memSamples),
      maxMemUtil:  max(memSamples),
      minMemUtil:  min(memSamples),
      dataPoints:  metrics.length,
    };

    return NextResponse.json({
      device: {
        id: device.id,
        name: device.name,
        ip: device.ip,
        status: device.status,
        snmpConfigured: device.credentials !== null,
        snmpVersion: device.credentials?.snmpVersion ?? null,
      },
      period: { hours, since: since.toISOString() },
      summary,
      data: metrics,
    });
  } catch (error) {
    console.error('[API /api/devices/[id]/snmp-metrics] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch SNMP metrics' }, { status: 500 });
  }
}
