import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

const SETTING_KEY = 'demo:generator:enabled';

export async function GET(): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    // DB connectivity check
    await prisma.$queryRaw`SELECT 1 as ok`;

    const [
      demoGeneratorSetting,
      deviceCounts,
      recentMetrics,
      activeAlerts,
    ] = await Promise.all([
      // Demo generator setting
      prisma.setting.findUnique({ where: { key: SETTING_KEY } }),
      // Device counts by type/status
      prisma.device.groupBy({
        by: ['isDemo', 'status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      // Recent metric count (last 5 min)
      prisma.metric.count({
        where: {
          timestamp: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      }),
      // Active alerts
      prisma.alert.count({ where: { status: 'ACTIVE' } }),
    ]);

    const demoGeneratorEnabled =
      (demoGeneratorSetting?.value as { enabled?: boolean } | null)?.enabled ?? true;

    // Aggregate device counts
    const deviceSummary = {
      total: 0,
      real: { up: 0, down: 0, unknown: 0, maintenance: 0 },
      demo: { up: 0, down: 0, unknown: 0, maintenance: 0 },
    };

    for (const d of deviceCounts) {
      const count = d._count.id;
      deviceSummary.total += count;
      if (d.isDemo) {
        deviceSummary.demo[d.status.toLowerCase() as keyof typeof deviceSummary.demo] += count;
      } else {
        deviceSummary.real[d.status.toLowerCase() as keyof typeof deviceSummary.real] += count;
      }
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
        demoGenerator: demoGeneratorEnabled ? 'enabled' : 'disabled',
      },
      metrics: {
        recent5min: recentMetrics,
        activeAlerts,
      },
      devices: deviceSummary,
      workers: {
        icmpPoller: 'check logs (pm2/logs)',
        demoGenerator: demoGeneratorEnabled ? 'should be running' : 'disabled',
        snmpPoller: 'check logs (pm2/logs)',
      },
    });
  } catch (error) {
    console.error('[API /api/health] Error:', error);
    return NextResponse.json(
      { status: 'unhealthy', error: 'Health check failed' },
      { status: 503 }
    );
  }
}