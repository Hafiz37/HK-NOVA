import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { getProvisioningAnalytics } from '@/lib/provisioning-analytics';

/**
 * GET /api/provisioning/analytics?days=30
 * Get provisioning analytics and statistics
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') ?? '30');

    const stats = await getProvisioningAnalytics(prisma, days);

    return NextResponse.json({ data: stats });
  } catch (error) {
    console.error('[API /api/provisioning/analytics GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch provisioning analytics' }, { status: 500 });
  }
}