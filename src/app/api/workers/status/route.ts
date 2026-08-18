import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { getPollingIntervalMs, intervalToLabel, DEFAULT_POLL_INTERVAL_MS } from '@/lib/polling-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workers/status
 *
 * Menentukan status worker berdasarkan keberadaan data terbaru di DB.
 * Threshold memakai interval polling terkonfigurasi (polling:real:interval) + buffer.
 * Health metrics (expectedCycles, missedCycles, lag, avgDuration) dihitung
 * dari clustering timestamp metrik di DB — tidak membutuhkan IPC ke worker process.
 * Window: fixed 2 jam observasi agar expected/actual cycles konsisten.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const now = Date.now();

    // Interval polling terkonfigurasi (berlaku untuk ICMP & SNMP sekaligus)
    const intervalMs = (await getPollingIntervalMs(prisma)) ?? DEFAULT_POLL_INTERVAL_MS;

    // Threshold aktif: bebas 2 siklus (min. 30 detik buffer)
    // Threshold ICMP & SNMP memakai interval yang sama (satu pengaturan global)
    const POLL_THRESHOLD_MS    = Math.max(intervalMs * 2, 30_000);   // 2 siklus terlewat
    const BACKUP_THRESHOLD_MS  = 25 * 60 * 60 * 1000;                // 25 jam

    // Observation window for cycle health (2 hours)
    const WINDOW_MS = 2 * 60 * 60 * 1000;
    const windowStart = now - WINDOW_MS;

    // ── ICMP Worker ───────────────────────────────────────────────────────────
    const [latestIcmp, latestSnmp] = await Promise.all([
      prisma.metric.findFirst({
        where: { metricType: 'ICMP', source: 'REAL' },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
      // ── SNMP Worker ─────────────────────────────────────────────────────────
      prisma.metric.findFirst({
        where: { metricType: 'SNMP', source: 'REAL' },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
    ]);

    const lastIcmpMs   = latestIcmp   ? new Date(latestIcmp.timestamp).getTime()   : 0;
    const isIcmpActive = lastIcmpMs  > 0 && now - lastIcmpMs  <= POLL_THRESHOLD_MS;

    const lastSnmpMs   = latestSnmp   ? new Date(latestSnmp.timestamp).getTime()   : 0;
    const isSnmpActive = lastSnmpMs  > 0 && now - lastSnmpMs  <= POLL_THRESHOLD_MS;

    // Uptime based on window (not first metric ever)
    const icmpUptimeSec = isIcmpActive ? Math.floor(WINDOW_MS / 1000) : null;
    const snmpUptimeSec = isSnmpActive ? Math.floor(WINDOW_MS / 1000) : null;

    // ── Cycle health metrics (fixed 2h window, DB-inferred from timestamp clustering) ───────────
    // Interval & bucket mengikuti pengaturan interval global
    const ICMP_BUCKET_MS = Math.max((intervalMs / 2) | 0, 5_000);
    const SNMP_BUCKET_MS = Math.max((intervalMs / 2) | 0, 5_000);

    const computeCycleHealth = (
      windowStartMs: number,
      windowEndMs: number,
      intervalMs: number,
      bucketMs: number,
      timestamps: number[]
    ) => {
      if (timestamps.length === 0) {
        return {
          expectedCycles: 0, actualCycles: 0, missedCycles: 0,
          avgCycleDurationMs: null, lastCycleDurationMs: null, lagSeconds: null,
        };
      }

      // Expected cycles in the observation window
      const windowDurationMs = windowEndMs - windowStartMs;
      const expectedCycles = Math.max(1, Math.floor(windowDurationMs / intervalMs));

      // Greedy bucket scan to count distinct cycles within window
      const sorted      = [...timestamps].sort((a, b) => a - b);
      const bucketStarts: number[] = [];
      let lastBucket    = -Infinity;
      for (const ts of sorted) {
        if (ts - lastBucket > bucketMs) {
          bucketStarts.push(ts);
          lastBucket = ts;
        }
      }
      const actualCycles  = bucketStarts.length;
      const missedCycles  = Math.max(0, expectedCycles - actualCycles);

      // Avg / last cycle duration from inter-bucket gap
      let avgCycleDurationMs:  number | null = null;
      let lastCycleDurationMs: number | null = null;
      if (bucketStarts.length >= 2) {
        const deltas        = bucketStarts.slice(1).map((t, i) => t - bucketStarts[i]);
        avgCycleDurationMs  = Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length);
        lastCycleDurationMs = deltas[deltas.length - 1];
      }

      // Lag: seconds since the next expected run was due (0 = on-schedule)
      const lastMetricMs = sorted[sorted.length - 1];
      const expectedNextRun = lastMetricMs + intervalMs;
      const lagSeconds      = now > expectedNextRun ? Math.round((now - expectedNextRun) / 1000) : 0;

      return { expectedCycles, actualCycles, missedCycles, avgCycleDurationMs, lastCycleDurationMs, lagSeconds };
    };

    // Fetch recent metric timestamps (last 2h) for cycle inference
    const [icmpTimestamps, snmpTimestamps] = await Promise.all([
      prisma.metric.findMany({
        where: { metricType: 'ICMP', source: 'REAL', timestamp: { gte: new Date(windowStart) } },
        select: { timestamp: true },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.metric.findMany({
        where: { metricType: 'SNMP', source: 'REAL', timestamp: { gte: new Date(windowStart) } },
        select: { timestamp: true },
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    const icmpTsMs = icmpTimestamps.map(m => new Date(m.timestamp).getTime());
    const snmpTsMs = snmpTimestamps.map(m => new Date(m.timestamp).getTime());

    const icmpHealth = computeCycleHealth(windowStart, now, intervalMs, ICMP_BUCKET_MS, icmpTsMs);
    const snmpHealth = computeCycleHealth(windowStart, now, intervalMs, SNMP_BUCKET_MS, snmpTsMs);

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
    const isAnomalyActive = lastAnomalyMs > 0 && now - lastAnomalyMs <= POLL_THRESHOLD_MS;

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
        configuredIntervalMs: intervalMs,
        configuredIntervalLabel: intervalToLabel(intervalMs),
        health: {
          expectedCycles:      icmpHealth.expectedCycles,
          actualCycles:        icmpHealth.actualCycles,
          missedCycles:        icmpHealth.missedCycles,
          avgCycleDurationMs:  icmpHealth.avgCycleDurationMs,
          lastCycleDurationMs: icmpHealth.lastCycleDurationMs,
          lagSeconds:          icmpHealth.lagSeconds,
        },
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
        configuredIntervalMs: intervalMs,
        configuredIntervalLabel: intervalToLabel(intervalMs),
        health: {
          expectedCycles:      snmpHealth.expectedCycles,
          actualCycles:        snmpHealth.actualCycles,
          missedCycles:        snmpHealth.missedCycles,
          avgCycleDurationMs:  snmpHealth.avgCycleDurationMs,
          lastCycleDurationMs: snmpHealth.lastCycleDurationMs,
          lagSeconds:          snmpHealth.lagSeconds,
        },
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
        health: null,
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
        health: null,
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
