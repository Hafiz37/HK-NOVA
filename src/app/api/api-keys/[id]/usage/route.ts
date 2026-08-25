import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

interface UsageWhere {
  apiKeyId: string;
  timestamp?: {
    gte?: Date;
    lte?: Date;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN, UserRole.OPERATOR]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const apiKey = await prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    // Check ownership (unless admin)
    if (apiKey.userId !== auth.user.id && auth.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const where: UsageWhere = { apiKeyId: id };
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    const usage = await prisma.apiKeyUsage.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    // Aggregate stats
    const stats = await prisma.apiKeyUsage.groupBy({
      by: ['endpoint', 'method'],
      where,
      _count: { id: true },
      _avg: { responseTime: true },
    });

    return NextResponse.json({
      data: {
        usage,
        stats: stats.map(s => ({
          endpoint: s.endpoint,
          method: s.method,
          count: s._count.id,
          avgResponseTime: s._avg.responseTime,
        })),
      },
    });
  } catch (error) {
    console.error('[API /api/api-keys/[id]/usage GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch API key usage' }, { status: 500 });
  }
}