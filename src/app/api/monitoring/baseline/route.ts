import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import {
  buildBaseline,
  getLatestValue,
  deviationScore,
  classifyDeviation,
  type BaselineField,
} from '@/lib/baseline';
import { BASELINE_WINDOW_HOURS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const VALID_FIELDS: BaselineField[] = ['latency', 'packetLoss', 'cpu', 'mem'];

/**
 * GET /api/monitoring/baseline?field=cpu&n=10&hours=24
 * Overview semua perangkat untuk satu metrik, diurutkan berdasarkan nilai
 * absolut deviasi (z-score) terbesar. Menskip perangkat tanpa data.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const fieldParam = searchParams.get('field') ?? 'cpu';
    if (!VALID_FIELDS.includes(fieldParam as BaselineField)) {
      return NextResponse.json(
        { error: `field harus salah satu dari: ${VALID_FIELDS.join(', ')}` },
        { status: 400 }
      );
    }
    const field = fieldParam as BaselineField;
    const n = Math.min(50, Math.max(1, Number(searchParams.get('n') ?? '10')));
    const hours = Math.min(168, Math.max(1, Number(searchParams.get('hours') ?? String(BASELINE_WINDOW_HOURS))));

    const devices = await prisma.device.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, ip: true, type: true, status: true },
    });

    const rows = await Promise.all(
      devices.map(async (device) => {
        const [current, { baseline, insufficientData }] = await Promise.all([
          getLatestValue(prisma, { deviceId: device.id, field }),
          buildBaseline(prisma, { deviceId: device.id, field, windowHours: hours }),
        ]);

        if (current == null || insufficientData) return null;

        return {
          device,
          baseline,
          current,
          deviation: {
            score: deviationScore(current, baseline),
            level: classifyDeviation(current, baseline),
          },
          timestamp: new Date().toISOString(),
        };
      })
    );

    const ranked = rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => Math.abs(b.deviation.score) - Math.abs(a.deviation.score))
      .slice(0, n);

    const summary = {
      devicesAnalyzed: ranked.length,
      warning: ranked.filter((r) => r.deviation.level === 'WARNING').length,
      critical: ranked.filter((r) => r.deviation.level === 'CRITICAL').length,
      normal: ranked.filter((r) => r.deviation.level === 'NORMAL').length,
    };

    return NextResponse.json({ field, n, hours, summary, data: ranked, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[API /api/monitoring/baseline] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch baseline overview' }, { status: 500 });
  }
}