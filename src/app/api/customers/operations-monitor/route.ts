import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { deviceRateLimiter } from '@/lib/device-rate-limiter';
import { deviceCircuitBreakerManager } from '@/lib/mikrotik/circuit-breaker';
import { success, ApiError, InternalServerError } from '@/lib/api-response';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const devices = await prisma.device.findMany({
      where: {
        OR: [
          { type: 'ROUTER' },
          { vendor: { contains: 'MikroTik' } },
        ],
      },
      select: {
        id: true,
        name: true,
        ip: true,
        status: true,
      },
    });

    const metrics = await Promise.all(
      devices.map(async (device) => {
        const rateLimitStatus = await deviceRateLimiter.getDeviceStatus(device.id);
        const circuitState = deviceCircuitBreakerManager.getDeviceState(device.id);

        const logs = await prisma.customerProvisioningLog.findMany({
          where: {
            customer: {
              deviceId: device.id,
            },
            executedAt: {
              gte: new Date(Date.now() - 3600000), // Last 1 hour
            },
          },
          select: {
            success: true,
          },
        });

        const totalOps = logs.length;
        const successOps = logs.filter(l => l.success).length;
        const successRate = totalOps > 0 ? (successOps / totalOps) * 100 : 100;

        return {
          deviceId: device.id,
          deviceName: device.name,
          deviceIp: device.ip,
          deviceStatus: device.status,
          activeOps: rateLimitStatus.activeOps,
          queueLength: rateLimitStatus.queueLength,
          circuitOpen: circuitState === 'OPEN',
          circuitState,
          consecutiveFailures: rateLimitStatus.consecutiveFailures,
          opsLastHour: totalOps,
          successRate: Math.round(successRate),
        };
      })
    );

    const overallStats = {
      totalDevices: devices.length,
      devicesWithOpenCircuit: metrics.filter(m => m.circuitOpen).length,
      totalActiveOps: metrics.reduce((sum, m) => sum + m.activeOps, 0),
      totalQueuedOps: metrics.reduce((sum, m) => sum + m.queueLength, 0),
      averageSuccessRate: metrics.length > 0 
        ? Math.round(metrics.reduce((sum, m) => sum + m.successRate, 0) / metrics.length)
        : 100,
    };

    return NextResponse.json(success({
      stats: overallStats,
      devices: metrics,
    }));
  } catch (err) {
    console.error('[API /api/customers/operations-monitor GET] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}
