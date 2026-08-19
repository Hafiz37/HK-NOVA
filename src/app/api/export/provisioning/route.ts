import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { parseExportFormat, EXPORT_MAX_ROWS } from '@/lib/export/shared';
import { renderExport } from '@/lib/export/render';

const DATE = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/export/provisioning?format=csv|xlsx|pdf&deviceId=&action=&status=
 * Downloads the OLT provisioning history.
 */
export async function GET(request: NextRequest): Promise<Response | NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.export, 'export:provisioning', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const format = parseExportFormat(sp.get('format')) ?? 'csv';
    const deviceId = sp.get('deviceId');
    const action = sp.get('action');
    const status = sp.get('status');

    const where: Record<string, unknown> = {};
    if (deviceId) where.deviceId = deviceId;
    if (action) where.action = action;
    if (status) where.status = status;

    const logs = await prisma.provisioningLog.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      take: EXPORT_MAX_ROWS + 1,
      include: {
        device: { select: { name: true, ip: true, vendor: true } },
      },
    });

    const rows = logs.map((l) => ({
      executedAt: l.executedAt.toISOString(),
      deviceName: l.device?.name ?? '',
      deviceIp: l.device?.ip ?? '',
      vendor: l.device?.vendor ?? '',
      action: l.action,
      status: l.status,
      ontSerial: l.ontSerial ?? '',
      ponPort: l.ponPort ?? '',
      vlan: l.vlan ?? '',
      serviceProfile: l.serviceProfile ?? '',
      executedBy: l.executedBy ?? '',
      errorMessage: l.errorMessage ?? '',
      command: l.command,
    }));

    await logAudit({
      action: 'EXPORT',
      entity: 'ProvisioningLog',
      userId: auth.user.id,
      details: { format, deviceId: deviceId ?? null, action: action ?? null, status: status ?? null, rowCount: rows.length },
      ipAddress: getClientIp(request),
    });

    return renderExport({
      format,
      filename: `provisioning-${DATE()}`,
      sheetName: 'Provisioning',
      title: 'Riwayat Provisioning OLT/ONT',
      subtitle: 'Aktivitas provisi, suspend, dan reactivate ONT',
      columns: [
        { key: 'executedAt', header: 'Waktu', width: 24 },
        { key: 'deviceName', header: 'Device', width: 20 },
        { key: 'deviceIp', header: 'IP', width: 16 },
        { key: 'vendor', header: 'Vendor', width: 12 },
        { key: 'action', header: 'Aksi', width: 12 },
        { key: 'status', header: 'Status', width: 10 },
        { key: 'ontSerial', header: 'ONT Serial', width: 18 },
        { key: 'ponPort', header: 'PON', width: 12 },
        { key: 'vlan', header: 'VLAN', width: 8 },
        { key: 'serviceProfile', header: 'Service', width: 14 },
        { key: 'executedBy', header: 'Eksekutor', width: 16 },
        { key: 'errorMessage', header: 'Error', width: 30 },
        { key: 'command', header: 'Perintah', width: 50 },
      ],
      rows,
    });
  } catch (error) {
    console.error('[API /api/export/provisioning] Error:', error);
    return NextResponse.json({ error: 'Gagal mengekspor riwayat provisioning' }, { status: 500 });
  }
}