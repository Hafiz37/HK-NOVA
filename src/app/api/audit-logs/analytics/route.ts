import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getAuditAnalytics } from '@/lib/audit/analytics';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const analytics = await getAuditAnalytics(start, end);

    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('Audit analytics error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}