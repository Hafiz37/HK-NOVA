import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/alerts/[id]/resolve
 * Updates alert status to RESOLVED.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireSession();
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
