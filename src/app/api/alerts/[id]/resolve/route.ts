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
 * POST /api/alerts/[id]/resolve
 * Updates alert status to RESOLVED.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'alerts:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    const alert = await prisma.alert.findUnique({ where: { id } });

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    if (alert.status === 'RESOLVED') {
      return NextResponse.json(
        { error: 'Alert is already resolved' },
        { status: 409 }
      );
    }

    const before = {
      status: alert.status,
      resolvedAt: alert.resolvedAt,
    };

    const updated = await prisma.alert.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
      include: {
        device: {
          select: { id: true, name: true, ip: true },
        },
      },
    });

    // Resolve child alerts (korelasi) bila induk di-resolve manual
    const childrenResolved = await prisma.alert.updateMany({
      where: {
        parentId: id,
        status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    await recordAlertActivity(prisma, {
      alertId: id,
      action: 'RESOLVED',
      actor: { id: auth.user.id, name: auth.user.username },
      message: `Alert di-resolve oleh ${auth.user.username}`,
      details: { resolvedAt: updated.resolvedAt?.toISOString() ?? null, childrenResolved: childrenResolved.count },
    });

    await logAudit({
      action: 'RESOLVE',
      entity: 'Alert',
      entityId: id,
      userId: auth.user.id,
      details: {
        before,
        after: {
          status: updated.status,
          resolvedAt: updated.resolvedAt,
          childrenResolved: childrenResolved.count,
        },
        fieldsChanged: ['status', 'resolvedAt'],
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ data: updated, message: 'Alert resolved successfully' });
  } catch (error) {
    console.error('[API /api/alerts/[id]/resolve] Error:', error);
    return NextResponse.json({ error: 'Failed to resolve alert' }, { status: 500 });
  }
}
