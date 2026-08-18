import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { parsePositiveNumberParam } from '@/lib/utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface IfEntry {
  index: number;
  name: string;
  operStatus: number;
  speed: number;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
}

/**
 * GET /api/devices/[id]/snmp-metrics?hours=24&includeBandwidth=true
 *
 * Returns time-series SNMP metric history (CPU, memory, interfaces) for a device.
 * When includeBandwidth=true, also computes per-interface bandwidth rates (bps)
 * from consecutive octet counter deltas.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const searchParams     = request.nextUrl.searchParams;
    const hours            = parsePositiveNumberParam(searchParams.get('hours'), 24, 1, 168); // max 7 days
    const includeBandwidth = searchParams.get('includeBandwidth') === 'true';

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

    // ── Interface bandwidth rate calculation ──────────────────────────────────
    // For each pair of consecutive metrics that have interfaceData, compute
    // inBps / outBps = (octets_delta / seconds_delta) * 8
    const bandwidthTimeSeries: Array<{
      timestamp: string;
      interfaces: Array<{
        index: number;
        name: string;
        operStatus: number;
        speed: number;
        inBps: number;
        outBps: number;
        inErrors: number;
        outErrors: number;
      }>;
    }> = [];

    if (includeBandwidth) {
      for (let i = 1; i < metrics.length; i++) {
        const prev = metrics[i - 1];
        const curr = metrics[i];

        const prevIfs = Array.isArray(prev.interfaceData) ? (prev.interfaceData as unknown as IfEntry[]) : [];
        const currIfs = Array.isArray(curr.interfaceData) ? (curr.interfaceData as unknown as IfEntry[]) : [];

        if (prevIfs.length === 0 || currIfs.length === 0) continue;

        const prevTs  = new Date(prev.timestamp).getTime();
        const currTs  = new Date(curr.timestamp).getTime();
        const deltaS  = (currTs - prevTs) / 1000;
        if (deltaS <= 0) continue;

        const prevMap = new Map<number, IfEntry>(prevIfs.map(iface => [iface.index, iface]));

        type RateIf = {
          index: number; name: string; operStatus: number; speed: number;
          inBps: number; outBps: number; inErrors: number; outErrors: number;
        };
        const rateInterfaces: RateIf[] = currIfs.flatMap((iface) => {
            const p = prevMap.get(iface.index);
            if (!p) return [];

            const MAX64 = 18446744073709551616;
            const inDelta  = iface.inOctets  >= p.inOctets  ? iface.inOctets  - p.inOctets  : MAX64 - p.inOctets  + iface.inOctets;
            const outDelta = iface.outOctets >= p.outOctets ? iface.outOctets - p.outOctets : MAX64 - p.outOctets + iface.outOctets;

            return [{
              index:      iface.index,
              name:       iface.name,
              operStatus: iface.operStatus,
              speed:      iface.speed,
              inBps:      Math.round((inDelta  / deltaS) * 8),
              outBps:     Math.round((outDelta / deltaS) * 8),
              inErrors:   iface.inErrors,
              outErrors:  iface.outErrors,
            }];
          });

        if (rateInterfaces.length > 0) {
          bandwidthTimeSeries.push({
            timestamp:  curr.timestamp.toISOString(),
            interfaces: rateInterfaces,
          });
        }
      }
    }

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
      ...(includeBandwidth ? { bandwidthTimeSeries } : {}),
    });
  } catch (error) {
    console.error('[API /api/devices/[id]/snmp-metrics] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch SNMP metrics' }, { status: 500 });
  }
}
