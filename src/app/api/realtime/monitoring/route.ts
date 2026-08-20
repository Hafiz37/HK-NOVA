import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/realtime/monitoring
 *
 * Server-Sent Events endpoint that streams ICMP monitoring data to connected clients.
 * Polls DB every 15 seconds and pushes monitoring-update events including device statuses,
 * summary stats, and active alerts.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response as unknown as Response;

  const encoder = new TextEncoder();
  const POLL_INTERVAL_MS = 15_000;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

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

      const fetchAndSend = async () => {
        if (closed) return;
        try {
          const [devices, alerts, latestMetrics] = await Promise.all([
            prisma.device.findMany({
              where: { deletedAt: null },
              select: {
                id: true, name: true, ip: true, type: true, vendor: true,
                location: true, status: true, isDemo: true,
              },
              orderBy: { name: 'asc' },
            }),
            prisma.alert.findMany({
              where: { status: 'ACTIVE' },
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: {
                id: true, type: true, severity: true, message: true,
                status: true, createdAt: true,
                device: { select: { name: true, ip: true } },
              },
            }),
            // Latest ICMP metric per device
            prisma.$queryRaw<
              Array<{ deviceId: string; latency: number | null; packetLoss: number | null; timestamp: Date }>
            >`
              SELECT m.deviceId, m.latency, m.packetLoss, m.timestamp
              FROM Metric m
              INNER JOIN (
                SELECT deviceId, MAX(timestamp) AS maxTs
                FROM Metric WHERE metricType = 'ICMP' GROUP BY deviceId
              ) latest ON m.deviceId = latest.deviceId AND m.timestamp = latest.maxTs
              WHERE m.metricType = 'ICMP'
            `,
          ]);

          const metricMap = new Map(latestMetrics.map(m => [m.deviceId, m]));
          const enriched  = devices.map(d => {
            const m = metricMap.get(d.id);
            return {
              ...d,
              latestLatency:    m?.latency    !== undefined ? m.latency    : null,
              latestPacketLoss: m?.packetLoss !== undefined ? m.packetLoss : null,
              lastCheck:        m?.timestamp  ? new Date(m.timestamp).toISOString() : null,
            };
          });

          const up      = enriched.filter(d => d.status === 'UP').length;
          const down    = enriched.filter(d => d.status === 'DOWN').length;
          const unknown = enriched.filter(d => d.status === 'UNKNOWN').length;

          const latencies   = latestMetrics.filter(m => m.latency !== null).map(m => Number(m.latency));
          const avgLatencyMs = latencies.length ? latencies.reduce((s, v) => s + v, 0) / latencies.length : null;

          send('monitoring-update', {
            devices:   enriched,
            summary: {
              devices:     { total: enriched.length, up, down, unknown },
              alerts:      { active: alerts.length },
              avgLatencyMs,
            },
            alerts,
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error('[API /api/realtime/monitoring] Error:', err);
          send('error', { message: 'Terjadi kesalahan saat mengambil data monitoring' });
        }
      };

      await fetchAndSend();
      const timer = setInterval(() => { void fetchAndSend(); }, POLL_INTERVAL_MS);
      request.signal.addEventListener('abort', () => clearInterval(timer));
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':                'text/event-stream; charset=utf-8',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
