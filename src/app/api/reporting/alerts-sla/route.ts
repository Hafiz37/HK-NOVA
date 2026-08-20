import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { parsePositiveIntParam } from '@/lib/utils';

/**
 * GET /api/reporting/alerts-sla?days=7
 * Agregasi MTTR/SLA dari alert yang sudah selesai:
 *  - rata-rata time-to-acknowledge & time-to-resolve (menit)
 *  - per severity dan per device (top waktu penyelesaian)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const rateLimitError = rateLimitResponse(RATE_LIMITS.read, 'reporting:sla', getClientIp(request) || '127.0.0.1');
  if (rateLimitError) return rateLimitError;

  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parsePositiveIntParam(searchParams.get('days'), 7, 1, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const alerts = await prisma.alert.findMany({
      where: { resolvedAt: { not: null }, parentId: null, createdAt: { gte: since } },
      select: {
        severity: true,
        deviceId: true,
        createdAt: true,
        firstTriggeredAt: true,
        acknowledgedAt: true,
        resolvedAt: true,
        device: { select: { name: true } },
      },
    });

    const toMinutes = (ms: number) => ms / 60_000;
    const onset = (a: (typeof alerts)[number]) => a.firstTriggeredAt ?? a.createdAt;

    const ackTimes: number[] = [];
    const resolveTimes: number[] = [];
    const bySeverity = new Map<string, { count: number; ackMin: number[]; resolveMin: number[] }>();
    const byDevice = new Map<string, { name: string; count: number; resolveMin: number[] }>();

    for (const a of alerts) {
      const start = onset(a).getTime();
      if (a.acknowledgedAt) ackTimes.push(toMinutes(a.acknowledgedAt.getTime() - start));
      if (a.resolvedAt) resolveTimes.push(toMinutes(a.resolvedAt.getTime() - start));

      const sev = bySeverity.get(a.severity) ?? { count: 0, ackMin: [], resolveMin: [] };
      sev.count += 1;
      if (a.acknowledgedAt) sev.ackMin.push(toMinutes(a.acknowledgedAt.getTime() - start));
      if (a.resolvedAt) sev.resolveMin.push(toMinutes(a.resolvedAt.getTime() - start));
      bySeverity.set(a.severity, sev);

      if (a.deviceId) {
        const d = byDevice.get(a.deviceId) ?? { name: a.device?.name ?? 'unknown', count: 0, resolveMin: [] };
        d.count += 1;
        if (a.resolvedAt) d.resolveMin.push(toMinutes(a.resolvedAt.getTime() - start));
        byDevice.set(a.deviceId, d);
      }
    }

    const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
    const round1 = (n: number) => Math.round(n * 10) / 10;

    const bySeverityList = [...bySeverity.entries()].map(([severity, v]) => ({
      severity,
      count: v.count,
      avgAckMinutes: round1(avg(v.ackMin)),
      avgResolveMinutes: round1(avg(v.resolveMin)),
    }));

    const byDeviceList = [...byDevice.entries()]
      .map(([deviceId, v]) => ({
        deviceId,
        name: v.name,
        count: v.count,
        avgResolveMinutes: round1(avg(v.resolveMin)),
      }))
      .sort((a, b) => b.avgResolveMinutes - a.avgResolveMinutes)
      .slice(0, 10);

    return NextResponse.json({
      data: {
        period: { days, since: since.toISOString() },
        summary: {
          count: alerts.length,
          avgAckMinutes: round1(avg(ackTimes)),
          avgResolveMinutes: round1(avg(resolveTimes)),
        },
        bySeverity: bySeverityList,
        byDevice: byDeviceList,
      },
    });
  } catch (error) {
    console.error('[API /api/reporting/alerts-sla] Error:', error);
    return NextResponse.json({ error: 'Gagal menghitung SLA' }, { status: 500 });
  }
}