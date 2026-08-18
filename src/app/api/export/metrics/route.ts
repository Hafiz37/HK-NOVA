import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { parseExportFormat, EXPORT_MAX_ROWS } from '@/lib/export/shared';
import { renderExport } from '@/lib/export/render';
import { parsePositiveNumberParam } from '@/lib/utils';

const DATE = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/export/metrics?deviceId=&hours=24&type=ICMP&format=csv|xlsx|pdf
 * Downloads the time-series metrics for a specific device.
 */
export async function GET(request: NextRequest): Promise<Response | NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.export, 'export:metrics', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const format = parseExportFormat(sp.get('format')) ?? 'csv';
    const deviceId = sp.get('deviceId');
    const hours = parsePositiveNumberParam(sp.get('hours'), 24, 1, 168);
    const metricType = sp.get('type') ?? 'ICMP';

    if (!deviceId) {
      return NextResponse.json({ error: 'Parameter `deviceId` wajib diisi' }, { status: 400 });
    }

    const device = await prisma.device.findFirst({
      where: { id: deviceId, deletedAt: null },
      select: { id: true, name: true, ip: true },
    });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const metrics = await prisma.metric.findMany({
      where: { deviceId, metricType, timestamp: { gte: since } },
      select: {
        timestamp: true,
        metricType: true,
        latency: true,
        packetLoss: true,
        cpuUtil: true,
        memUtil: true,
      },
      orderBy: { timestamp: 'asc' },
      take: EXPORT_MAX_ROWS + 1,
    });

    const rows = metrics.map((m) => ({
      timestamp: m.timestamp.toISOString(),
      metricType: m.metricType,
      latencyMs: m.latency ?? '',
      packetLossPct: m.packetLoss ?? '',
      cpuUtilPct: m.cpuUtil ?? '',
      memUtilPct: m.memUtil ?? '',
    }));

    await logAudit({
      action: 'EXPORT',
      entity: 'Metric',
      userId: auth.user.id,
      details: { format, deviceId, deviceName: device.name, hours, metricType, rowCount: rows.length },
      ipAddress: getClientIp(request),
    });

    return renderExport({
      format,
      filename: `metrics-${device.name}-${DATE()}`,
      sheetName: 'Metrics',
      title: 'Data Metrik Kinerja',
      subtitle: `${device.name} (${device.ip}) — ${metricType} — ${hours} jam terakhir`,
      columns: [
        { key: 'timestamp', header: 'Waktu', width: 24 },
        { key: 'metricType', header: 'Jenis', width: 10 },
        { key: 'latencyMs', header: 'Latency (ms)', width: 14 },
        { key: 'packetLossPct', header: 'Packet Loss (%)', width: 16 },
        { key: 'cpuUtilPct', header: 'CPU (%)', width: 10 },
        { key: 'memUtilPct', header: 'MEM (%)', width: 10 },
      ],
      rows,
    });
  } catch (error) {
    console.error('[API /api/export/metrics] Error:', error);
    return NextResponse.json({ error: 'Gagal mengekspor metrik' }, { status: 500 });
  }
}