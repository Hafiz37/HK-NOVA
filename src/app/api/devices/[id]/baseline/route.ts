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

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_FIELDS: BaselineField[] = ['latency', 'packetLoss', 'cpu', 'mem'];

/**
 * GET /api/devices/[id]/baseline?field=cpu&hours=24
 * Returns the historical baseline (mean/stddev/p95), latest value, and the
 * deviation level (NORMAL/WARNING/CRITICAL) of the current value vs baseline.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const fieldParam = searchParams.get('field') ?? 'cpu';
    if (!VALID_FIELDS.includes(fieldParam as BaselineField)) {
      return NextResponse.json(
        { error: `field harus salah satu dari: ${VALID_FIELDS.join(', ')}` },
        { status: 400 }
      );
    }
    const field = fieldParam as BaselineField;
    const hours = Math.min(168, Math.max(1, Number(searchParams.get('hours') ?? '24')));

    const device = await prisma.device.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, ip: true, type: true, status: true },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const [current, { baseline, insufficientData }] = await Promise.all([
      getLatestValue(prisma, { deviceId: id, field }),
      buildBaseline(prisma, { deviceId: id, field, windowHours: hours }),
    ]);

    const deviation =
      current != null
        ? {
            score: deviationScore(current, baseline),
            level: classifyDeviation(current, baseline),
          }
        : { score: null, level: 'INSUFFICIENT_DATA' as const };

    return NextResponse.json({
      device,
      field,
      window: { hours, since: new Date(Date.now() - hours * 3600_000).toISOString() },
      baseline,
      insufficientData,
      current,
      deviation,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /api/devices/[id]/baseline] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch baseline' }, { status: 500 });
  }
}