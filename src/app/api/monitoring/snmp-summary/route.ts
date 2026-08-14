import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/monitoring/snmp-summary
 * Returns aggregate SNMP statistics: avg CPU/mem, per-device latest readings,
 * HIGH_UTILIZATION alert counts, and worker heartbeat detection.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const SNMP_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes window
    const now = Date.now();

    // ── Latest SNMP metric per device ────────────────────────────────────────
    const latestSnmpMetrics = await prisma.$queryRaw<
      Array<{
        deviceId: string;
        cpuUtil:  number | null;
        memUtil:  number | null;
        timestamp: Date;
      }>
    >`
      SELECT m.deviceId, m.cpuUtil, m.memUtil, m.timestamp
      FROM Metric m
      INNER JOIN (
        SELECT deviceId, MAX(timestamp) AS maxTs
        FROM Metric
        WHERE metricType = 'SNMP'
        GROUP BY deviceId
      ) latest ON m.deviceId = latest.deviceId AND m.timestamp = latest.maxTs
      WHERE m.metricType = 'SNMP'
    `;

    // ── Aggregate CPU / mem averages ─────────────────────────────────────────
    const cpuSamples = latestSnmpMetrics
      .filter((r) => r.cpuUtil !== null)
      .map((r) => Number(r.cpuUtil));
    const memSamples = latestSnmpMetrics
      .filter((r) => r.memUtil !== null)
      .map((r) => Number(r.memUtil));

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

    // ── Devices with HIGH_UTILIZATION alerts ─────────────────────────────────
    const highUtilAlerts = await prisma.alert.count({
      where: { type: 'HIGH_UTILIZATION', status: 'ACTIVE' },
    });

    // ── SNMP worker heartbeat ─────────────────────────────────────────────────
    const latestSnmpRecord = await prisma.metric.findFirst({
      where: { metricType: 'SNMP' },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });

    const lastSnmpMs    = latestSnmpRecord ? new Date(latestSnmpRecord.timestamp).getTime() : 0;
    const isSnmpActive  = lastSnmpMs > 0 && now - lastSnmpMs <= SNMP_THRESHOLD_MS;

    // ── Per-device readings ───────────────────────────────────────────────────
    // Enrich with device name/ip
    const deviceIds = latestSnmpMetrics.map((m) => m.deviceId);
    const deviceInfo = deviceIds.length
      ? await prisma.device.findMany({
          where: { id: { in: deviceIds }, deletedAt: null },
          select: { id: true, name: true, ip: true, status: true },
        })
      : [];

    const deviceMap = new Map(deviceInfo.map((d) => [d.id, d]));

    const devicesWithSnmp = latestSnmpMetrics.map((m) => {
      const d = deviceMap.get(m.deviceId);
      return {
        deviceId:  m.deviceId,
        name:      d?.name   ?? 'Unknown',
        ip:        d?.ip     ?? '',
        status:    d?.status ?? 'UNKNOWN',
        cpuUtil:   m.cpuUtil !== null ? Number(m.cpuUtil)  : null,
        memUtil:   m.memUtil !== null ? Number(m.memUtil)  : null,
        timestamp: m.timestamp,
      };
    });

    const devicesPolled   = devicesWithSnmp.length;
    const devicesHighCpu  = devicesWithSnmp.filter((d) => (d.cpuUtil  ?? 0) >= 85).length;
    const devicesHighMem  = devicesWithSnmp.filter((d) => (d.memUtil  ?? 0) >= 90).length;

    return NextResponse.json({
      worker: {
        active:        isSnmpActive,
        lastHeartbeat: latestSnmpRecord?.timestamp ?? null,
      },
      aggregate: {
        avgCpuUtil:     avg(cpuSamples),
        avgMemUtil:     avg(memSamples),
        devicesPolled,
        devicesHighCpu,
        devicesHighMem,
        highUtilAlerts,
      },
      devices:     devicesWithSnmp,
      updatedAt:   new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /api/monitoring/snmp-summary] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch SNMP summary' }, { status: 500 });
  }
}
