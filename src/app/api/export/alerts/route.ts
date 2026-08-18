import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { AlertStatus, AlertSeverity, AlertType } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { parseExportFormat, EXPORT_MAX_ROWS } from '@/lib/export/shared';
import { renderExport } from '@/lib/export/render';

const DATE = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/export/alerts?format=csv|xlsx|pdf&status=&severity=&search=&deviceId=
 * Downloads alert history matching the filters.
 */
export async function GET(request: NextRequest): Promise<Response | NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.export, 'export:alerts', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const format = parseExportFormat(sp.get('format')) ?? 'csv';
    const statusParam = sp.get('status');
    const severityParam = sp.get('severity');
    const search = sp.get('search')?.trim();
    const deviceId = sp.get('deviceId');

    const where: Record<string, unknown> = { parentId: null };

    if (statusParam && ['ACTIVE', 'RESOLVED', 'ACKNOWLEDGED'].includes(statusParam)) {
      where.status = statusParam as AlertStatus;
    }
    if (severityParam && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severityParam)) {
      where.severity = severityParam as AlertSeverity;
    }
    if (deviceId) where.deviceId = deviceId;
    if (search) {
      const upper = search.toUpperCase();
      const typeMatches = Object.values(AlertType).filter((t) => t.includes(upper));
      const or: Array<Record<string, unknown>> = [
        { message: { contains: search } },
        { device: { is: { name: { contains: search } } } },
        { device: { is: { ip: { contains: search } } } },
      ];
      if (typeMatches.length > 0) or.push({ type: { in: typeMatches } });
      where.OR = or;
    }

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_MAX_ROWS + 1,
      include: {
        device: { select: { name: true, ip: true, type: true, location: true } },
      },
    });

    const rows = alerts.map((a) => ({
      timestamp: a.createdAt.toISOString(),
      severity: a.severity,
      status: a.status,
      type: a.type,
      deviceName: a.device?.name ?? '',
      deviceIp: a.device?.ip ?? '',
      deviceType: a.device?.type ?? '',
      message: a.message,
      acknowledgedAt: a.acknowledgedAt ? a.acknowledgedAt.toISOString() : '',
      resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : '',
    }));

    await logAudit({
      action: 'EXPORT',
      entity: 'Alert',
      userId: auth.user.id,
      details: { format, filters: { status: statusParam, severity: severityParam, search, deviceId }, rowCount: rows.length },
      ipAddress: getClientIp(request),
    });

    return renderExport({
      format,
      filename: `alerts-${DATE()}`,
      sheetName: 'Alerts',
      title: 'Riwayat Alert',
      subtitle: 'Riwayat kejadian alert perangkat jaringan',
      columns: [
        { key: 'timestamp', header: 'Waktu', width: 24 },
        { key: 'severity', header: 'Severity', width: 10 },
        { key: 'status', header: 'Status', width: 12 },
        { key: 'type', header: 'Tipe', width: 20 },
        { key: 'deviceName', header: 'Device', width: 20 },
        { key: 'deviceIp', header: 'IP', width: 16 },
        { key: 'deviceType', header: 'Tipe Device', width: 14 },
        { key: 'message', header: 'Pesan', width: 50 },
        { key: 'acknowledgedAt', header: 'Acknowledged', width: 24 },
        { key: 'resolvedAt', header: 'Resolved', width: 24 },
      ],
      rows,
    });
  } catch (error) {
    console.error('[API /api/export/alerts] Error:', error);
    return NextResponse.json({ error: 'Gagal mengekspor alert' }, { status: 500 });
  }
}