import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAlertActivity } from '@/lib/alert-engine';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/alerts/[id]
 * Update penanggung jawab (`assigneeId`) dan/atau catatan (`note`) sebuah alert.
 * Menulis timeline AlertActivity untuk setiap perubahan.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'alerts:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as
      | { assigneeId?: string | null; note?: string | null }
      | null;

    if (!body || (body.assigneeId === undefined && body.note === undefined)) {
      return NextResponse.json(
        { error: 'Kirim assigneeId dan/atau note untuk diperbarui' },
        { status: 400 }
      );
    }

    const alert = await prisma.alert.findUnique({
      where: { id },
      include: { assignee: { select: { id: true, username: true, fullName: true } } },
    });

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    // Validasi assignee saat diatur
    if (body.assigneeId !== undefined && body.assigneeId !== null) {
      const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId } });
      if (!assignee) {
        return NextResponse.json({ error: 'Assignee tidak ditemukan' }, { status: 400 });
      }
    }

    const data: { assigneeId?: string | null; note?: string | null } = {};
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
    if (body.note !== undefined) data.note = body.note;

    const before = { assigneeId: alert.assigneeId, note: alert.note };

    const updated = await prisma.alert.update({
      where: { id },
      data,
      include: { assignee: { select: { id: true, username: true, fullName: true } } },
    });

    const actor = { id: auth.user.id, name: auth.user.username };

    if (body.assigneeId !== undefined && body.assigneeId !== alert.assigneeId) {
      const assignee =
        body.assigneeId === null
          ? null
          : await prisma.user.findUnique({ where: { id: body.assigneeId } });
      await recordAlertActivity(prisma, {
        alertId: id,
        action: 'ASSIGNED',
        actor,
        message: `Alert di-assign ke ${assignee?.fullName || assignee?.username || 'tidak ada'}`,
        details: { from: alert.assignee?.id ?? null, to: body.assigneeId },
      });
    }

    if (body.note !== undefined && body.note !== alert.note) {
      await recordAlertActivity(prisma, {
        alertId: id,
        action: 'NOTE_ADDED',
        actor,
        message: body.note ? `Catatan: ${body.note}` : 'Catatan dihapus',
        details: { note: body.note ?? null },
      });
    }

    await logAudit({
      action: 'UPDATE',
      entity: 'Alert',
      entityId: id,
      userId: auth.user.id,
      details: {
        before,
        after: { assigneeId: updated.assigneeId, note: updated.note },
        fieldsChanged: ['assigneeId', 'note'].filter((f) => f in data),
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[API /api/alerts/[id] PATCH] Error:', error);
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}