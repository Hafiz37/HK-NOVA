import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { AlertStatus, AlertSeverity, AlertType } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { queryAlertSchema } from '@/lib/schemas';
import { success, paginated, ApiError, InternalServerError } from '@/lib/api-response';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = queryAlertSchema.parse(Object.fromEntries(searchParams));

    const where: {
      status?: AlertStatus;
      severity?: AlertSeverity;
      type?: AlertType;
      deviceId?: string;
      assigneeId?: string;
      OR?: Array<Record<string, unknown>>;
      createdAt?: { gte?: Date; lte?: Date };
      parentId?: null;
    } = { parentId: null };

    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.type) where.type = query.type;
    if (query.deviceId) where.deviceId = query.deviceId;
    if (query.assigneeId) where.assigneeId = query.assigneeId;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = query.startDate;
      if (query.endDate) where.createdAt.lte = query.endDate;
    }

    if (query.search) {
      const upper = query.search.toUpperCase();
      const typeMatches = Object.values(AlertType).filter((t) => t.includes(upper));
      const or: Array<Record<string, unknown>> = [
        { message: { contains: query.search } },
        { device: { is: { name: { contains: query.search } } } },
        { device: { is: { ip: { contains: query.search } } } },
      ];
      if (typeMatches.length > 0) or.push({ type: { in: typeMatches } });
      where.OR = or;
    }

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
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
          deliveries: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          _count: {
            select: { deliveries: true },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.alert.count({ where }),
    ]);

    return NextResponse.json(paginated(alerts, query.page, query.limit, total));
  } catch (err) {
    console.error('[API /api/alerts] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}