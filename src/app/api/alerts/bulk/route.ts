import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole, AlertStatus } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAlertActivity } from '@/lib/alert-engine';
import { bulkAcknowledgeSchema, bulkResolveSchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, InternalServerError } from '@/lib/api-response';
import { invalidateOnMutation } from '@/lib/query';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'alerts:bulk', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    let validatedData;
    let action: 'acknowledge' | 'resolve';

    if (body.action === 'acknowledge') {
      validatedData = bulkAcknowledgeSchema.parse(body);
      action = 'acknowledge';
    } else if (body.action === 'resolve') {
      validatedData = bulkResolveSchema.parse(body);
      action = 'resolve';
    } else {
      throw new ValidationError('Action must be "acknowledge" or "resolve"');
    }

    const { ids, userId } = validatedData;
    const note = 'note' in validatedData ? validatedData.note : undefined;
    const resolutionNote = 'resolutionNote' in validatedData ? validatedData.resolutionNote : undefined;

    const uniqueIds = [...new Set(ids)];

    if (uniqueIds.length > 100) {
      throw new ValidationError('Maximum 100 alerts per bulk operation');
    }

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

    const actor = { id: userId || auth.user.id, name: auth.user.username };
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
          details: { bulk: true, note: action === 'acknowledge' ? note : resolutionNote },
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

    await invalidateOnMutation('alerts');

    return NextResponse.json(success(
      { action, requested: uniqueIds.length, updated },
      { message: `${updated} alert berhasil di-${action === 'acknowledge' ? 'acknowledge' : 'resolve'}` }
    ));
  } catch (err) {
    console.error('[API /api/alerts/bulk POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}