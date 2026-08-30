import { register, devicesTotal, alertsActive, workerLastRunTimestamp } from '@/lib/metrics';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Update device metrics
    const deviceCounts = await prisma.device.groupBy({
      by: ['status', 'type'],
      _count: true,
    });
    
    deviceCounts.forEach((group) => {
      devicesTotal.set({ status: group.status, type: group.type }, group._count);
    });

    // Update alert metrics
    const alertCounts = await prisma.alert.groupBy({
      by: ['severity', 'type'],
      where: { status: 'ACTIVE' },
      _count: true,
    });
    
    alertCounts.forEach((group) => {
      alertsActive.set({ severity: group.severity, type: group.type }, group._count);
    });

    // Update worker metrics (last run from metrics table)
    const workerMetrics = await prisma.metric.findMany({
      distinct: ['deviceId'],
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: { deviceId: true, timestamp: true },
    });
    
    if (workerMetrics.length > 0) {
      const latestTimestamp = workerMetrics[0].timestamp.getTime() / 1000;
      workerLastRunTimestamp.set({ worker_name: 'icmp-poller' }, latestTimestamp);
    }

    const metrics = await register.metrics();
    return new Response(metrics, {
      headers: { 'Content-Type': register.contentType }
    });
  } catch (error) {
    console.error('Error collecting metrics:', error);
    return new Response(await register.metrics(), {
      headers: { 'Content-Type': register.contentType }
    });
  }
}
