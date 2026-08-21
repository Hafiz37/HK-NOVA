import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { cacheGet, cacheSet } from '@/lib/redis-cache';

/**
 * GET /api/monitoring/summary
 * Returns a summary: total devices, up/down count, active alerts, avg latency.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const cacheKey = 'monitoring:summary';
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const [
      totalDevices,
      upDevices,
      downDevices,
      unknownDevices,
      activeAlerts,
      recentMetrics,
    ] = await Promise.all([
      prisma.device.count({ where: { deletedAt: null } }),
      prisma.device.count({ where: { deletedAt: null, status: 'UP' } }),
      prisma.device.count({ where: { deletedAt: null, status: 'DOWN' } }),
      prisma.device.count({ where: { deletedAt: null, status: 'UNKNOWN' } }),
      prisma.alert.count({ where: { status: 'ACTIVE' } }),
      // Get the most recent ICMP metric per device for average latency
      prisma.$queryRaw<Array<{ avgLatency: number | null }>>`
        SELECT AVG(m.latency) as avgLatency
        FROM Metric m
        INNER JOIN (
          SELECT deviceId, MAX(timestamp) as maxTs
          FROM Metric
          WHERE metricType = 'ICMP' AND latency IS NOT NULL
          GROUP BY deviceId
        ) latest ON m.deviceId = latest.deviceId AND m.timestamp = latest.maxTs
        WHERE m.metricType = 'ICMP' AND m.latency IS NOT NULL
      `,
    ]);

    const avgLatency =
      recentMetrics[0]?.avgLatency != null
        ? Number(recentMetrics[0].avgLatency)
        : null;

    // Alert breakdown by severity
    const alertsBySeverity = await prisma.alert.groupBy({
      by: ['severity'],
      where: { status: 'ACTIVE' },
      _count: { id: true },
    });

    const severityBreakdown = Object.fromEntries(
      alertsBySeverity.map((a) => [a.severity, a._count.id])
    );

    const result = {
      devices: {
        total: totalDevices,
        up: upDevices,
        down: downDevices,
        unknown: unknownDevices,
        maintenance: totalDevices - upDevices - downDevices - unknownDevices,
      },
      alerts: {
        active: activeAlerts,
        bySeverity: severityBreakdown,
      },
      avgLatencyMs: avgLatency,
      updatedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, result, { ttlSeconds: 10 });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API /api/monitoring/summary] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}
