import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getSecurityTimeline, acknowledgeEvent, getUnacknowledgedEvents } from '@/lib/security/timeline';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const severity = searchParams.get('severity');
    const acknowledged = searchParams.get('acknowledged');

    const offset = (page - 1) * limit;
    const filters: any = {};
    if (severity) filters.severity = severity;
    if (acknowledged !== null) filters.acknowledged = acknowledged === 'true';

    const result = await getSecurityTimeline(auth.user.id, limit, offset, filters);

    return NextResponse.json({
      data: result.data,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
      unacknowledgedCount: result.unacknowledgedCount,
    });
  } catch (error) {
    console.error('Security timeline error:', error);
    return NextResponse.json({ error: 'Failed to fetch security timeline' }, { status: 500 });
  }
}