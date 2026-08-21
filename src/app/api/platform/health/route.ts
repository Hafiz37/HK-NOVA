import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getCacheStatus } from '@/lib/redis-cache';
import { telemetry } from '@/lib/telemetry';
import os from 'os';

export const dynamic = 'force-dynamic';

/**
 * GET /api/platform/health
 * Meta-monitoring API returning system resources, cache status, process uptime, and internal telemetry.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const memoryUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpus = os.cpus();

    const cacheStatus = getCacheStatus();
    const telemetrySummary = telemetry.getSummary(300_000); // 5 min window

    return NextResponse.json({
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          heapUsedMb: Number((memoryUsage.heapUsed / 1024 / 1024).toFixed(2)),
          heapTotalMb: Number((memoryUsage.heapTotal / 1024 / 1024).toFixed(2)),
          rssMb: Number((memoryUsage.rss / 1024 / 1024).toFixed(2)),
        },
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpuCores: cpus.length,
        cpuModel: cpus[0]?.model ?? 'Unknown',
        loadAvg: os.loadavg(),
        memory: {
          totalMb: Number((totalMem / 1024 / 1024).toFixed(2)),
          freeMb: Number((freeMem / 1024 / 1024).toFixed(2)),
          usedPct: Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1)),
        },
      },
      cache: cacheStatus,
      telemetry: telemetrySummary,
    });
  } catch (error) {
    console.error('[API /api/platform/health] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch platform health' }, { status: 500 });
  }
}