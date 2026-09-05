import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { detectAnomalousAccess, getAuditAnalytics } from '@/lib/audit/analytics';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const timeRangeDays = parseInt(searchParams.get('timeRangeDays') || '30', 10);
    const allUsers = searchParams.get('allUsers') === 'true';

    let anomalies: Array<{
      type: string;
      severity: string;
      timestamp: string;
      details: Record<string, unknown>;
      username?: string;
      fullName?: string;
    }> = [];

    if (allUsers) {
      const users = await prisma.user.findMany({ select: { id: true } });
      for (const user of users) {
        const userAnomalies = await detectAnomalousAccess(user.id, timeRangeDays);
        if (userAnomalies.length > 0) {
          const userDetails = await prisma.user.findUnique({
            where: { id: user.id },
            select: { username: true, fullName: true },
          });
      anomalies.push(
        ...userAnomalies.map((a) => ({
          type: a.anomalyType,
          severity: a.severity,
          timestamp: a.timestamp.toISOString(),
          details: a.details as Record<string, unknown>,
          username: userDetails?.username || '',
          fullName: userDetails?.fullName || undefined,
          score: a.score,
        }))
      );
        }
      }
    } else if (userId) {
      const rawAnomalies = await detectAnomalousAccess(userId, timeRangeDays);
      const userDetails = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, fullName: true },
      });
      anomalies = rawAnomalies.map((a) => ({
        type: a.anomalyType,
        severity: a.severity,
        timestamp: a.timestamp.toISOString(),
        details: a.details as Record<string, unknown>,
        username: userDetails?.username || '',
        fullName: userDetails?.fullName || undefined,
        score: a.score,
      }));
    } else {
      const analytics = await getAuditAnalytics(
        new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000),
        new Date()
      );
      anomalies = analytics.suspiciousActivities.map((a) => ({
        type: a.type,
        severity: a.severity,
        timestamp: new Date().toISOString(),
        details: { count: a.count } as Record<string, unknown>,
        score: a.count / 100,
      }));
    }

    // Sort by score
    const sortedAnomalies = anomalies.map(a => ({
      ...a,
      score: ('score' in a ? a.score : 0) as number
    }));
    sortedAnomalies.sort((a, b) => (b.score as number) - (a.score as number));

    return NextResponse.json({ anomalies: sortedAnomalies.slice(0, 100) });
  } catch (error) {
    console.error('Audit anomalies error:', error);
    return NextResponse.json({ error: 'Failed to fetch anomalies' }, { status: 500 });
  }
}