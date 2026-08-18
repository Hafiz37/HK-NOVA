import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { parsePositiveIntParam } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface TopItem {
  deviceId: string;
  name: string;
  ip: string;
  type: string;
  status: string;
  value: number;
  timestamp: Date | null;
}

/**
 * GET /api/monitoring/top?n=5
 * Returns top-N lists: devices with most active alerts, highest latency,
 * packet loss, CPU, and memory utilization (based on latest metrics).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const n = parsePositiveIntParam(request.nextUrl.searchParams.get('n'), 5, 1, 20);
    const showDemo = request.nextUrl.searchParams.get('showDemo') !== 'false';

    // ── Top-N devices by active alerts ────────────────────────────────────────
    const alertGroup = await prisma.alert.groupBy({
      by: ['deviceId'],
      where: { status: { in: ['ACTIVE', 'ACKNOWLEDGED'] }, deviceId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: n,
    });

    // ── Latest metric per device (ICMP & SNMP) ────────────────────────────────
    const latestMetrics = await prisma.$queryRaw<
      Array<{
        deviceId: string;
        metricType: string;
        latency: number | null;
        packetLoss: number | null;
        cpuUtil: number | null;
        memUtil: number | null;
        timestamp: Date;
      }>
    >`
      SELECT m.deviceId, m.metricType, m.latency, m.packetLoss, m.cpuUtil, m.memUtil, m.timestamp
      FROM Metric m
      INNER JOIN (
        SELECT deviceId, metricType, MAX(timestamp) AS maxTs
        FROM Metric
        GROUP BY deviceId, metricType
      ) latest ON m.deviceId = latest.deviceId AND m.metricType = latest.metricType AND m.timestamp = latest.maxTs
    `;

    const latestByDevice = new Map<string, { icmp?: typeof latestMetrics[0]; snmp?: typeof latestMetrics[0] }>();
    for (const m of latestMetrics) {
      const entry = latestByDevice.get(m.deviceId) ?? {};
      if (m.metricType === 'ICMP') entry.icmp = m;
      if (m.metricType === 'SNMP') entry.snmp = m;
      latestByDevice.set(m.deviceId, entry);
    }

    // ── Enrich with device info ────────────────────────────────────────────────
    const allDeviceIds = new Set<string>([
      ...alertGroup.map((a) => a.deviceId as string),
      ...latestByDevice.keys(),
    ]);

    const devices = allDeviceIds.size
      ? await prisma.device.findMany({
          where: {
            id: { in: [...allDeviceIds] },
            deletedAt: null,
            ...(showDemo ? {} : { isDemo: false }),
          },
          select: { id: true, name: true, ip: true, type: true, status: true },
        })
      : [];
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    const enrich = (
      deviceId: string,
      value: number | null,
      timestamp: Date | null
    ): TopItem | null => {
      if (value == null) return null;
      const d = deviceMap.get(deviceId);
      if (!d) return null;
      return {
        deviceId,
        name: d.name,
        ip: d.ip,
        type: d.type,
        status: d.status,
        value: Number(value),
        timestamp,
      };
    };

    const topAlerts: TopItem[] = alertGroup
      .map((a) => enrich(a.deviceId as string, a._count.id, null))
      .filter((x): x is TopItem => x !== null);

    const pick = (predicate: (m: { icmp?: typeof latestMetrics[0]; snmp?: typeof latestMetrics[0] }) => { value: number | null; timestamp: Date | null } | null) =>
      [...latestByDevice.entries()]
        .map(([deviceId, entry]) => {
          const picked = predicate(entry);
          return picked ? enrich(deviceId, picked.value, picked.timestamp) : null;
        })
        .filter((x): x is TopItem => x !== null)
        .sort((a, b) => b.value - a.value)
        .slice(0, n);

    const topLatency = pick((e) =>
      e.icmp && e.icmp.latency != null
        ? { value: e.icmp.latency, timestamp: e.icmp.timestamp }
        : null
    );

    const topPacketLoss = pick((e) =>
      e.icmp && e.icmp.packetLoss != null
        ? { value: e.icmp.packetLoss, timestamp: e.icmp.timestamp }
        : null
    );

    const topCpu = pick((e) =>
      e.snmp && e.snmp.cpuUtil != null
        ? { value: e.snmp.cpuUtil, timestamp: e.snmp.timestamp }
        : null
    );

    const topMem = pick((e) =>
      e.snmp && e.snmp.memUtil != null
        ? { value: e.snmp.memUtil, timestamp: e.snmp.timestamp }
        : null
    );

    return NextResponse.json({
      n,
      topAlerts,
      topLatency,
      topPacketLoss,
      topCpu,
      topMem,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /api/monitoring/top] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch top-N lists' }, { status: 500 });
  }
}
