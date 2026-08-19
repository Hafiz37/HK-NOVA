import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { parseExportFormat, EXPORT_MAX_ROWS } from '@/lib/export/shared';
import { renderExport } from '@/lib/export/render';

const DATE = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/export/backups?format=csv|xlsx|pdf&deviceId=
 * Downloads the config backup history.
 */
export async function GET(request: NextRequest): Promise<Response | NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.export, 'export:backups', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const format = parseExportFormat(sp.get('format')) ?? 'csv';
    const deviceId = sp.get('deviceId');

    const backups = await prisma.backup.findMany({
      where: deviceId ? { deviceId } : {},
      orderBy: { timestamp: 'desc' },
      take: EXPORT_MAX_ROWS + 1,
      include: {
        device: { select: { name: true, ip: true, type: true, vendor: true } },
      },
    });

    const rows = backups.map((b) => ({
      timestamp: b.timestamp.toISOString(),
      deviceName: b.device?.name ?? '',
      deviceIp: b.device?.ip ?? '',
      deviceType: b.device?.type ?? '',
      vendor: b.device?.vendor ?? '',
      status: b.status,
      configHash: b.configHash,
      changeDetected: b.changeDetected ? 'Ya' : 'Tidak',
      errorMessage: b.errorMessage ?? '',
    }));

    await logAudit({
      action: 'EXPORT',
      entity: 'Backup',
      userId: auth.user.id,
      details: { format, deviceId: deviceId ?? null, rowCount: rows.length },
      ipAddress: getClientIp(request),
    });

    return renderExport({
      format,
      filename: `backups-${DATE()}`,
      sheetName: 'Backups',
      title: 'Riwayat Backup Konfigurasi',
      subtitle: 'Snapshot konfigurasi perangkat HK-NOVA',
      columns: [
        { key: 'timestamp', header: 'Waktu', width: 24 },
        { key: 'deviceName', header: 'Device', width: 20 },
        { key: 'deviceIp', header: 'IP', width: 16 },
        { key: 'deviceType', header: 'Tipe', width: 10 },
        { key: 'vendor', header: 'Vendor', width: 14 },
        { key: 'status', header: 'Status', width: 10 },
        { key: 'configHash', header: 'Hash', width: 20 },
        { key: 'changeDetected', header: 'Berubah', width: 10 },
        { key: 'errorMessage', header: 'Error', width: 30 },
      ],
      rows,
    });
  } catch (error) {
    console.error('[API /api/export/backups] Error:', error);
    return NextResponse.json({ error: 'Gagal mengekspor riwayat backup' }, { status: 500 });
  }
}