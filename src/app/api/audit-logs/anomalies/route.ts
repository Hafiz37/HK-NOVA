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
    const timeRangeDays = parseInt(searchParams.get('timeRangeDays') || '30');
    const allUsers = searchParams.get('allUsers') === 'true';

    let anomalies: any[] = [];

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
              ...a,
              username: userDetails?.username || '',
              fullName: userDetails?.fullName || null,
            }))
          );
        }
      }
    } else if (userId) {
      anomalies = await detectAnomalousAccess(userId, timeRangeDays);
      const userDetails = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, fullName: true },
      });
      anomalies = anomalies.map((a) => ({
        ...a,
        username: userDetails?.username || '',
        fullName: userDetails?.fullName || null,
      }));
    } else {
      const analytics = await getAuditAnalytics(
        new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000),
        new Date()
      );
      anomalies = analytics.suspiciousActivities.map((a) => ({
        anomalyType: a.type,
        severity: a.severity,
        details: { count: a.count },
        score: a.severity === 'critical' ? 90 : a.severity === 'high' ? 75 : a.severity === 'medium' ? 50 : 25,
        timestamp: new Date(),
      }));
    }

    anomalies.sort((a, b) => b.score - a.score);

    return NextResponse.json({ anomalies: anomalies.slice(0, 100) });
  } catch (error) {
    console.error('Audit anomalies error:', error);
    return NextResponse.json({ error: 'Failed to fetch anomalies' }, { status: 500 });
  }
}