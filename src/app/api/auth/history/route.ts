import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLoginHistory, getLoginStatistics } from '@/lib/security/login-history';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const success = searchParams.get('success');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const offset = (page - 1) * limit;
    const filters: any = {};
    if (success !== null) filters.success = success === 'true';
    if (dateFrom) filters.dateFrom = new Date(dateFrom);
    if (dateTo) filters.dateTo = new Date(dateTo);

    const [history, stats] = await Promise.all([
      getLoginHistory(auth.user.id, limit, offset, filters),
      getLoginStatistics(auth.user.id, 30),
    ]);

    return NextResponse.json({
      data: history.data,
      total: history.total,
      page,
      limit,
      totalPages: Math.ceil(history.total / limit),
      stats,
    });
  } catch (error) {
    console.error('Login history error:', error);
    return NextResponse.json({ error: 'Failed to fetch login history' }, { status: 500 });
  }
}