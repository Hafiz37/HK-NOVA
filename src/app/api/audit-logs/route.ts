import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const action = searchParams.get('action');
    const entity = searchParams.get('entity');
    const userId = searchParams.get('userId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: Record<string, unknown> = {};

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = entity;
    }

    if (userId) {
      where.userId = userId;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      const createdAt = where.createdAt as Record<string, Date>;
      if (dateFrom) {
        createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        createdAt.lte = new Date(dateTo);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          userId: true,
          details: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Enrich logs with user details
    const userIds = [...new Set(logs.map((log) => log.userId).filter(Boolean))] as string[];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        })
      : [];

    const userMap = new Map(users.map((u) => [u.id, u]));
    const enrichedLogs = logs.map((log) => ({
      ...log,
      user: log.userId ? userMap.get(log.userId) || null : null,
    }));

    return NextResponse.json({
      data: enrichedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[API /api/audit-logs GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}