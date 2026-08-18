import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DeviceType, DeviceStatus } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { parseExportFormat, EXPORT_MAX_ROWS } from '@/lib/export/shared';
import { renderExport } from '@/lib/export/render';

const DATE = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/export/devices?format=csv|xlsx|pdf&search=&type=&status=&showDemo=
 * Downloads the device inventory (with latest ICMP latency / packet loss).
 */
export async function GET(request: NextRequest): Promise<Response | NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.export, 'export:devices', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const format = parseExportFormat(sp.get('format')) ?? 'csv';
    const search = sp.get('search')?.trim();
    const typeParam = sp.get('type');
    const statusParam = sp.get('status');
    const showDemo = sp.get('showDemo') === 'true';

    const where: Record<string, unknown> = { deletedAt: null };
    if (!showDemo) where.isDemo = false;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { ip: { contains: search } },
        { vendor: { contains: search } },
        { model: { contains: search } },
        { location: { contains: search } },
      ];
    }
    if (typeParam && Object.values(DeviceType).includes(typeParam as DeviceType)) {
      where.type = typeParam as DeviceType;
    }
    if (statusParam && Object.values(DeviceStatus).includes(statusParam as DeviceStatus)) {
      where.status = statusParam as DeviceStatus;
    }

    const devices = await prisma.device.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_MAX_ROWS + 1,
      select: {
        id: true,
        name: true,
        ip: true,
        type: true,
        vendor: true,
        model: true,
        location: true,
        status: true,
        description: true,
        isDemo: true,
        createdAt: true,
        metrics: {
          where: { metricType: 'ICMP' },
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: { latency: true, packetLoss: true, timestamp: true },
        },
      },
    });

    const rows = devices.map((d) => ({
      name: d.name,
      ip: d.ip,
      type: d.type,
      vendor: d.vendor ?? '',
      model: d.model ?? '',
      location: d.location ?? '',
      status: d.status,
      description: d.description ?? '',
      isDemo: d.isDemo ? 'Ya' : 'Tidak',
      latencyMs: d.metrics[0]?.latency ?? '',
      packetLossPct: d.metrics[0]?.packetLoss ?? '',
      lastCheck: d.metrics[0]?.timestamp ? d.metrics[0].timestamp.toISOString() : '',
      createdAt: d.createdAt.toISOString(),
    }));

    await logAudit({
      action: 'EXPORT',
      entity: 'Device',
      userId: auth.user.id,
      details: { format, filters: { search, type: typeParam, status: statusParam, showDemo }, rowCount: rows.length },
      ipAddress: getClientIp(request),
    });

    return renderExport({
      format,
      filename: `devices-${DATE()}`,
      sheetName: 'Devices',
      title: 'Inventori Perangkat',
      subtitle: 'Daftar perangkat jaringan yang dipantau HK-NOVA',
      columns: [
        { key: 'name', header: 'Nama', width: 20 },
        { key: 'ip', header: 'IP', width: 16 },
        { key: 'type', header: 'Tipe', width: 12 },
        { key: 'vendor', header: 'Vendor', width: 16 },
        { key: 'model', header: 'Model', width: 16 },
        { key: 'location', header: 'Lokasi', width: 18 },
        { key: 'status', header: 'Status', width: 12 },
        { key: 'latencyMs', header: 'Latency (ms)', width: 12 },
        { key: 'packetLossPct', header: 'Packet Loss (%)', width: 14 },
        { key: 'lastCheck', header: 'Terakhir Cek', width: 24 },
        { key: 'description', header: 'Deskripsi', width: 30 },
      ],
      rows,
    });
  } catch (error) {
    console.error('[API /api/export/devices] Error:', error);
    return NextResponse.json({ error: 'Gagal mengekspor device' }, { status: 500 });
  }
}