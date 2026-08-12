import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/alerts/[id]/acknowledge
 * Updates alert status to ACKNOWLEDGED.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
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

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[API /api/alerts/[id]/acknowledge] Error:', error);
    return NextResponse.json({ error: 'Failed to acknowledge alert' }, { status: 500 });
  }
}
