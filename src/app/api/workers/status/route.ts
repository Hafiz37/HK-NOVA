import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workers/status
 *
 * Menentukan status worker berdasarkan keberadaan data terbaru di DB.
 * Threshold ICMP: 2 menit (sesuai cron interval default 1 menit + buffer).
 * Tidak membutuhkan proses worker menulis file PID atau heartbeat terpisah.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const now = Date.now();
    const ICMP_THRESHOLD_MS   = 2  * 60 * 1000;        // 2 menit
    const SNMP_THRESHOLD_MS   = 10 * 60 * 1000;        // 10 menit
    const BACKUP_THRESHOLD_MS = 25 * 60 * 60 * 1000;   // 25 jam

    // ── ICMP Worker ───────────────────────────────────────────────────────────
    const [latestIcmp, earliestIcmp, latestSnmp, earliestSnmp] = await Promise.all([
      prisma.metric.findFirst({
        where: { metricType: 'ICMP' },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
      prisma.metric.findFirst({
        where: { metricType: 'ICMP' },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true },
      }),
      // ── SNMP Worker ─────────────────────────────────────────────────────────
      prisma.metric.findFirst({
        where: { metricType: 'SNMP' },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
      prisma.metric.findFirst({
        where: { metricType: 'SNMP' },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true },
      }),
    ]);

    const lastIcmpMs    = latestIcmp   ? new Date(latestIcmp.timestamp).getTime()   : 0;
    const firstIcmpMs   = earliestIcmp ? new Date(earliestIcmp.timestamp).getTime() : 0;
    const isIcmpActive  = lastIcmpMs  > 0 && now - lastIcmpMs  <= ICMP_THRESHOLD_MS;
    const icmpUptimeSec = isIcmpActive && firstIcmpMs > 0
      ? Math.floor((now - firstIcmpMs) / 1000)
      : null;

    const lastSnmpMs    = latestSnmp   ? new Date(latestSnmp.timestamp).getTime()   : 0;
    const firstSnmpMs   = earliestSnmp ? new Date(earliestSnmp.timestamp).getTime() : 0;
    const isSnmpActive  = lastSnmpMs  > 0 && now - lastSnmpMs  <= SNMP_THRESHOLD_MS;
    const snmpUptimeSec = isSnmpActive && firstSnmpMs > 0
      ? Math.floor((now - firstSnmpMs) / 1000)
      : null;

    // ── Backup Worker ─────────────────────────────────────────────────────────
    const latestBackup = await prisma.backup.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    const lastBackupMs   = latestBackup ? new Date(latestBackup.timestamp).getTime() : 0;
    const isBackupActive = lastBackupMs > 0 && now - lastBackupMs <= BACKUP_THRESHOLD_MS;

    // ── Anomaly Detector ──────────────────────────────────────────────────────
    const latestAnomaly = await prisma.anomaly.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    const lastAnomalyMs   = latestAnomaly ? new Date(latestAnomaly.timestamp).getTime() : 0;
    const isAnomalyActive = lastAnomalyMs > 0 && now - lastAnomalyMs <= ICMP_THRESHOLD_MS;

    // ── Assemble response ─────────────────────────────────────────────────────
    const workers = [
      {
        id: 'icmp-worker',
        name: 'ICMP Poller Worker',
        type: 'ICMP',
        phase: 1,
        status: isIcmpActive ? 'RUNNING' : 'STOPPED',
        lastHeartbeat: latestIcmp?.timestamp ?? null,
        uptimeSeconds: icmpUptimeSec,
        detail: isIcmpActive
          ? `Active — polling device reachability (last: ${Math.round((now - lastIcmpMs) / 1000)}s ago)`
          : lastIcmpMs > 0
          ? `Stopped — last metric ${Math.round((now - lastIcmpMs) / 60000)}m ago. Run: pnpm worker:icmp`
          : 'Not started — Run: pnpm worker:icmp',
        command: 'pnpm worker:icmp',
      },
      {
        id: 'snmp-worker',
        name: 'SNMP Metrics Worker',
        type: 'SNMP',
        phase: 2,
        status: isSnmpActive ? 'RUNNING' : 'STOPPED',
        lastHeartbeat: latestSnmp?.timestamp ?? null,
        uptimeSeconds: snmpUptimeSec,
        detail: isSnmpActive
          ? `Active — polling CPU/memory/interfaces (last: ${Math.round((now - lastSnmpMs) / 1000)}s ago)`
          : lastSnmpMs > 0
          ? `Stopped — last metric ${Math.round((now - lastSnmpMs) / 60000)}m ago. Run: pnpm worker:snmp`
          : 'Not started — Run: pnpm worker:snmp',
        command: 'pnpm worker:snmp',
      },
      {
        id: 'backup-worker',
        name: 'Config Backup Worker',
        type: 'BACKUP',
        phase: 3,
        status: isBackupActive ? 'RUNNING' : 'STOPPED',
        lastHeartbeat: latestBackup?.timestamp ?? null,
        uptimeSeconds: null,
        detail: isBackupActive
          ? 'Active — config backup berjalan'
          : 'Phase 3 — belum diimplementasi',
        command: 'pnpm worker:backup',
      },
      {
        id: 'anomaly-detector',
        name: 'AI Anomaly Detector',
        type: 'ANOMALY',
        phase: 4,
        status: isAnomalyActive ? 'RUNNING' : 'STOPPED',
        lastHeartbeat: latestAnomaly?.timestamp ?? null,
        uptimeSeconds: null,
        detail: isAnomalyActive
          ? 'Active — deteksi anomali berjalan'
          : 'Phase 4 — belum diimplementasi',
        command: 'pnpm worker:anomaly',
      },
    ];

    const runningCount = workers.filter(w => w.status === 'RUNNING').length;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      summary: {
        total: workers.length,
        running: runningCount,
        stopped: workers.length - runningCount,
      },
      workers,
    });
  } catch (error) {
    console.error('[API /api/workers/status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch worker statuses' },
      { status: 500 }
    );
  }
}
