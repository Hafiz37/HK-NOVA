import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAlertActivity } from '@/lib/alert-engine';
import { RealtimeEmitter } from '@/lib/realtime';
import type { AlertEventData } from '@/lib/realtime';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/alerts/[id]/acknowledge
 * Updates alert status to ACKNOWLEDGED.
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

    if (alert.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Alert is already ${alert.status.toLowerCase()}` },
        { status: 409 }
      );
    }

    const before = {
      status: alert.status,
      acknowledgedAt: alert.acknowledgedAt,
    };

    const updated = await prisma.alert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
      },
      include: {
        device: {
          select: { id: true, name: true, ip: true },
        },
      },
    });

    await recordAlertActivity(prisma, {
      alertId: id,
      action: 'ACKNOWLEDGED',
      actor: { id: auth.user.id, name: auth.user.username },
      message: `Alert di-acknowledge oleh ${auth.user.username}`,
      details: { acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null },
    });

    await logAudit({
      action: 'ACKNOWLEDGE',
      entity: 'Alert',
      entityId: id,
      userId: auth.user.id,
      details: {
        before,
        after: {
          status: updated.status,
          acknowledgedAt: updated.acknowledgedAt,
        },
        fieldsChanged: ['status', 'acknowledgedAt'],
      },
      ipAddress: getClientIp(request),
    });

    RealtimeEmitter.alertAcknowledged({
      id: updated.id,
      type: updated.type,
      severity: updated.severity,
      status: updated.status,
      message: updated.message,
      deviceId: updated.deviceId,
      deviceName: updated.device?.name ?? '',
      deviceIp: updated.device?.ip ?? '',
      acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    } as AlertEventData, auth.user.id);

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[API /api/alerts/[id]/acknowledge] Error:', error);
    return NextResponse.json({ error: 'Failed to acknowledge alert' }, { status: 500 });
  }
}