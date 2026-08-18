import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { resolveThresholds } from '@/lib/thresholds';

export const dynamic = 'force-dynamic';

/**
 * GET /api/realtime/snmp
 *
 * Server-Sent Events endpoint that streams SNMP summary data to connected clients.
 * Polls the DB every 15 seconds and pushes updates. No pub/sub needed — the SNMP
 * worker writes to DB and this SSE endpoint reflects the latest state.
 *
 * SSE protocol: each message is `data: <json>\n\n`
 * Clients reconnect automatically (EventSource spec).
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response as unknown as Response;

  const encoder = new TextEncoder();
  const POLL_INTERVAL_MS = 15_000; // 15 s between DB polls

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      // Listen for client disconnect
      request.signal.addEventListener('abort', () => {
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      });

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Fetch and stream SNMP summary
      const fetchAndSend = async () => {
        if (closed) return;
        try {
          const SNMP_THRESHOLD_MS = 10 * 60 * 1000;
          const now = Date.now();

          const [latestSnmpRecord, latestSnmpMetrics, highUtilAlerts] = await Promise.all([
            prisma.metric.findFirst({
              where: { metricType: 'SNMP', source: 'REAL' },
              orderBy: { timestamp: 'desc' },
              select: { timestamp: true },
            }),
            prisma.$queryRaw<
              Array<{ deviceId: string; cpuUtil: number | null; memUtil: number | null; timestamp: Date }>
            >`
              SELECT m.deviceId, m.cpuUtil, m.memUtil, m.timestamp
              FROM Metric m
              INNER JOIN (
                SELECT deviceId, MAX(timestamp) AS maxTs
                FROM Metric WHERE metricType = 'SNMP' GROUP BY deviceId
              ) latest ON m.deviceId = latest.deviceId AND m.timestamp = latest.maxTs
              WHERE m.metricType = 'SNMP'
            `,
            prisma.alert.count({ where: { type: 'HIGH_UTILIZATION', status: 'ACTIVE' } }),
          ]);

          const lastSnmpMs = latestSnmpRecord ? new Date(latestSnmpRecord.timestamp).getTime() : 0;
          const isActive   = lastSnmpMs > 0 && now - lastSnmpMs <= SNMP_THRESHOLD_MS;

          const deviceIds  = latestSnmpMetrics.map(m => m.deviceId);
          const deviceInfo = deviceIds.length
            ? await prisma.device.findMany({
                where: { id: { in: deviceIds }, deletedAt: null },
                select: {
                  id: true, name: true, ip: true, status: true,
                  cpuThresholdOverride: true,
                  memThresholdOverride: true,
                  cpuResolveThresholdOverride: true,
                  memResolveThresholdOverride: true,
                },
              })
            : [];
          const deviceMap = new Map(deviceInfo.map(d => [d.id, d]));

          const devices = latestSnmpMetrics.map(m => {
            const d = deviceMap.get(m.deviceId);
            return {
              deviceId:  m.deviceId,
              name:      d?.name   ?? 'Unknown',
              ip:        d?.ip     ?? '',
              status:    d?.status ?? 'UNKNOWN',
              cpuUtil:   m.cpuUtil  !== null ? Number(m.cpuUtil)  : null,
              memUtil:   m.memUtil  !== null ? Number(m.memUtil)  : null,
              timestamp: m.timestamp,
            };
          });

          const cpuSamples = devices.filter(d => d.cpuUtil !== null).map(d => d.cpuUtil as number);
          const memSamples = devices.filter(d => d.memUtil !== null).map(d => d.memUtil as number);
          const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

          const highCpuCount = () => {
            let count = 0;
            for (const m of latestSnmpMetrics) {
              const d = deviceMap.get(m.deviceId);
              if (m.cpuUtil == null) continue;
              const t = d ? resolveThresholds({
                cpuThresholdOverride: d.cpuThresholdOverride,
                memThresholdOverride: d.memThresholdOverride,
                cpuResolveThresholdOverride: d.cpuResolveThresholdOverride,
                memResolveThresholdOverride: d.memResolveThresholdOverride,
              }) : null;
              if (m.cpuUtil >= (t?.cpuAlert ?? 85)) count++;
            }
            return count;
          };
          const highMemCount = () => {
            let count = 0;
            for (const m of latestSnmpMetrics) {
              const d = deviceMap.get(m.deviceId);
              if (m.memUtil == null) continue;
              const t = d ? resolveThresholds({
                cpuThresholdOverride: d.cpuThresholdOverride,
                memThresholdOverride: d.memThresholdOverride,
                cpuResolveThresholdOverride: d.cpuResolveThresholdOverride,
                memResolveThresholdOverride: d.memResolveThresholdOverride,
              }) : null;
              if (m.memUtil >= (t?.memAlert ?? 90)) count++;
            }
            return count;
          };

          send('snmp-update', {
            worker: { active: isActive, lastHeartbeat: latestSnmpRecord?.timestamp ?? null },
            aggregate: {
              avgCpuUtil:     avg(cpuSamples),
              avgMemUtil:     avg(memSamples),
              devicesPolled:  devices.length,
              devicesHighCpu: highCpuCount(),
              devicesHighMem: highMemCount(),
              highUtilAlerts,
            },
            devices,
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error('[API /api/realtime/snmp] Error:', err);
          send('error', { message: 'Terjadi kesalahan saat mengambil data SNMP' });
        }
      };

      // Initial fetch
      await fetchAndSend();

      // Poll on interval
      const timer = setInterval(() => { void fetchAndSend(); }, POLL_INTERVAL_MS);

      // Cleanup when stream ends
      request.signal.addEventListener('abort', () => clearInterval(timer));
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':                'text/event-stream; charset=utf-8',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no', // disable nginx buffering
      'Access-Control-Allow-Origin': '*',
    },
  });
}
