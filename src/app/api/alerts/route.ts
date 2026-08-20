import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { AlertStatus, AlertSeverity, AlertType } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { parsePositiveIntParam } from '@/lib/utils';

/**
 * GET /api/alerts?status=ACTIVE&severity=HIGH&search=...&page=1&limit=50
 * Returns filtered list of alerts (server-side pagination + search).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const statusParam = searchParams.get('status');
    const severityParam = searchParams.get('severity');
    const search = searchParams.get('search')?.trim();
    const deviceId = searchParams.get('deviceId');
    const page = parsePositiveIntParam(searchParams.get('page'), 1, 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePositiveIntParam(searchParams.get('limit'), 50, 1, 100);
    const skip = (page - 1) * limit;

    // Build filter
    const where: {
      status?: AlertStatus;
      severity?: AlertSeverity;
      deviceId?: string;
      OR?: Array<Record<string, unknown>>;
    } = {};

    if (statusParam && ['ACTIVE', 'RESOLVED', 'ACKNOWLEDGED'].includes(statusParam)) {
      where.status = statusParam as AlertStatus;
    }
    if (severityParam && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severityParam)) {
      where.severity = severityParam as AlertSeverity;
    }
    if (deviceId) where.deviceId = deviceId;
    if (search) {
      const upper = search.toUpperCase();
      const typeMatches = Object.values(AlertType).filter((t) => t.includes(upper));
      const or: Array<Record<string, unknown>> = [
        { message: { contains: search } },
        { device: { is: { name: { contains: search } } } },
        { device: { is: { ip: { contains: search } } } },
      ];
      if (typeMatches.length > 0) or.push({ type: { in: typeMatches } });
      where.OR = or;
    }
    const baseWhere: Record<string, unknown> = { ...where, parentId: null };

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where: baseWhere,
        include: {
          device: {
            select: { id: true, name: true, ip: true, type: true, location: true },
          },
          assignee: {
            select: { id: true, username: true, fullName: true },
          },
          childAlerts: {
            include: {
              device: {
                select: { id: true, name: true, ip: true, type: true, location: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          escalations: {
            orderBy: { triggeredAt: 'desc' },
            take: 5,
          },
          _count: {
            select: { deliveries: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.alert.count({ where: baseWhere }),
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
