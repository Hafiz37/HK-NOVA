import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole, AlertStatus } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAlertActivity } from '@/lib/alert-engine';

/**
 * POST /api/alerts/bulk
 * Aksi massal: { action: "acknowledge" | "resolve", ids: string[] }.
 * - acknowledge: hanya alert berstatus ACTIVE yang diubah.
 * - resolve    : semua alert yang belum RESOLVED.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'alerts:bulk', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as
      | { action?: string; ids?: string[] }
      | null;

    const action = body?.action;
    const ids = body?.ids;

    if (action !== 'acknowledge' && action !== 'resolve') {
      return NextResponse.json(
        { error: 'action harus "acknowledge" atau "resolve"' },
        { status: 400 }
      );
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids harus berupa array non-kosong' }, { status: 400 });
    }
    if (ids.length > 500) {
      return NextResponse.json({ error: 'Maksimal 500 alert per operasi bulk' }, { status: 400 });
    }

    const uniqueIds = [...new Set(ids)];

    const alerts = await prisma.alert.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, status: true, message: true },
    });

    const byId = new Map(alerts.map((a) => [a.id, a]));

    const eligible = uniqueIds
      .filter((id) => byId.has(id))
      .filter((id) =>
        action === 'acknowledge'
          ? byId.get(id)!.status === 'ACTIVE'
          : byId.get(id)!.status !== 'RESOLVED'
      );

    const actor = { id: auth.user.id, name: auth.user.username };
    const now = new Date();

    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const id of eligible) {
        const next: Partial<{ status: AlertStatus; acknowledgedAt: Date; resolvedAt: Date }> =
          action === 'acknowledge'
            ? { status: 'ACKNOWLEDGED', acknowledgedAt: now }
            : { status: 'RESOLVED', resolvedAt: now };

        await tx.alert.update({ where: { id }, data: next });
        await recordAlertActivity(tx, {
          alertId: id,
          action: action === 'acknowledge' ? 'ACKNOWLEDGED' : 'RESOLVED',
          actor,
          message: `${action === 'acknowledge' ? 'Bulk acknowledge' : 'Bulk resolve'} oleh ${auth.user.username}`,
          details: { bulk: true },
        });
        updated += 1;
      }
    });

    await logAudit({
      action: action === 'acknowledge' ? 'ACKNOWLEDGE' : 'RESOLVE',
      entity: 'Alert',
      entityId: `bulk:${uniqueIds.join(',')}`,
      userId: auth.user.id,
      details: {
        action,
        requested: uniqueIds.length,
        updated,
        notFound: uniqueIds.length - alerts.length,
        notEligible: uniqueIds.length - eligible.length - (uniqueIds.length - alerts.length),
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      data: { action, requested: uniqueIds.length, updated },
      message: `${updated} alert berhasil di-${action === 'acknowledge' ? 'acknowledge' : 'resolve'}`,
    });
  } catch (error) {
    console.error('[API /api/alerts/bulk POST] Error:', error);
    return NextResponse.json({ error: 'Gagal memproses aksi bulk' }, { status: 500 });
  }
}