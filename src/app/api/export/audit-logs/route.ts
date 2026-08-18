import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { parseExportFormat, EXPORT_MAX_ROWS } from '@/lib/export/shared';
import { renderExport } from '@/lib/export/render';

const DATE = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/export/audit-logs?format=csv|xlsx|pdf&action=&entity=&userId=&dateFrom=&dateTo=
 * Downloads all audit logs matching the filters (ADMIN only).
 */
export async function GET(request: NextRequest): Promise<Response | NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.export, 'export:audit-logs', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const format = parseExportFormat(sp.get('format')) ?? 'csv';
    const action = sp.get('action');
    const entity = sp.get('entity');
    const userId = sp.get('userId');
    const dateFrom = sp.get('dateFrom');
    const dateTo = sp.get('dateTo');

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (userId) where.userId = userId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      const createdAt = where.createdAt as Record<string, Date>;
      if (dateFrom) createdAt.gte = new Date(dateFrom);
      if (dateTo) createdAt.lte = new Date(dateTo);
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_MAX_ROWS + 1,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        userId: true,
        details: true,
        ipAddress: true,
        createdAt: true,
      },
    });

    const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, fullName: true, role: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const rows = logs.map((l) => {
      const u = l.userId ? userMap.get(l.userId) : null;
      return {
        timestamp: l.createdAt.toISOString(),
        username: u?.username ?? '',
        fullName: u?.fullName ?? '',
        role: u?.role ?? '',
        action: l.action,
        entity: l.entity,
        entityId: l.entityId ?? '',
        ipAddress: l.ipAddress ?? '',
        details: l.details ? JSON.stringify(l.details) : '',
      };
    });

    await logAudit({
      action: 'EXPORT',
      entity: 'AuditLog',
      userId: auth.user.id,
      details: { format, filters: { action, entity, userId, dateFrom, dateTo }, rowCount: rows.length },
      ipAddress: getClientIp(request),
    });

    return renderExport({
      format,
      filename: `audit-logs-${DATE()}`,
      sheetName: 'AuditLogs',
      title: 'Laporan Audit Log',
      subtitle: 'Riwayat aktivitas pengguna di sistem HK-NOVA',
      columns: [
        { key: 'timestamp', header: 'Waktu', width: 24 },
        { key: 'username', header: 'Username', width: 16 },
        { key: 'fullName', header: 'Nama Lengkap', width: 20 },
        { key: 'role', header: 'Role', width: 10 },
        { key: 'action', header: 'Aksi', width: 12 },
        { key: 'entity', header: 'Entitas', width: 16 },
        { key: 'entityId', header: 'Entity ID', width: 22 },
        { key: 'ipAddress', header: 'IP Address', width: 16 },
        { key: 'details', header: 'Detail (JSON)', width: 40 },
      ],
      rows,
    });
  } catch (error) {
    console.error('[API /api/export/audit-logs] Error:', error);
    return NextResponse.json({ error: 'Gagal mengekspor audit log' }, { status: 500 });
  }
}