import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { AlertStatus, AlertSeverity } from '@prisma/client';
import { requireSession } from '@/lib/auth';

/**
 * GET /api/alerts?status=ACTIVE&severity=HIGH
 * Returns filtered list of alerts.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const statusParam = searchParams.get('status');
    const severityParam = searchParams.get('severity');
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50')));
    const skip = (page - 1) * limit;

    // Build filter
    const where: {
      status?: AlertStatus;
      severity?: AlertSeverity;
    } = {};

    if (statusParam && ['ACTIVE', 'RESOLVED', 'ACKNOWLEDGED'].includes(statusParam)) {
      where.status = statusParam as AlertStatus;
    }
    if (severityParam && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severityParam)) {
      where.severity = severityParam as AlertSeverity;
    }

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: {
          device: {
            select: { id: true, name: true, ip: true, type: true, location: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.alert.count({ where }),
    ]);

    return NextResponse.json({
      data: alerts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[API /api/alerts] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}
