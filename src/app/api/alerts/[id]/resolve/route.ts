import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/alerts/[id]/resolve
 * Updates alert status to RESOLVED.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
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

    return NextResponse.json({ data: updated, message: 'Alert resolved successfully' });
  } catch (error) {
    console.error('[API /api/alerts/[id]/resolve] Error:', error);
    return NextResponse.json({ error: 'Failed to resolve alert' }, { status: 500 });
  }
}
