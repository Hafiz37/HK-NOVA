import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getQueueStatus } from '@/lib/redis-queue';
import { getCacheStatus } from '@/lib/redis-cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { status: 'healthy' | 'unhealthy'; latencyMs?: number; error?: string }> = {};

  // Check Database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'healthy', latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = {
      status: 'unhealthy',
      error: err instanceof Error ? err.message : 'Database query failed',
    };
    logger.error('Database health check failed', { module: 'health-check' }, err);
  }

  // Check Redis Queue & Cache Status
  try {
    const icmpQueue = await getQueueStatus('icmp');
    const snmpQueue = await getQueueStatus('snmp');
    const cacheStatus = getCacheStatus();

    checks.redisQueueICMP = {
      status: icmpQueue.connected || icmpQueue.backend === 'memory' ? 'healthy' : 'unhealthy',
    };
    checks.redisQueueSNMP = {
      status: snmpQueue.connected || snmpQueue.backend === 'memory' ? 'healthy' : 'unhealthy',
    };
    checks.redisCache = {
      status: cacheStatus.connected || cacheStatus.backend === 'memory' ? 'healthy' : 'unhealthy',
    };
  } catch (err) {
    checks.redis = {
      status: 'unhealthy',
      error: err instanceof Error ? err.message : 'Redis check failed',
    };
  }

  const isHealthy = Object.values(checks).every((c) => c.status === 'healthy');
  const responseTime = Date.now() - startTime;

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      checks,
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
      },
    },
    { status: isHealthy ? 200 : 503 }
  );
}
