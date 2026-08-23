import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession, requireRole } from '@/lib/auth';
import { createAutoTuner, runWeeklyAutoTune } from '@/lib/algorithms';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const action = searchParams.get('action') || 'status';

    if (action === 'status') {
      // Get tuning status for all devices
      const models = await prisma.anomalyModel.findMany({
        where: { isActive: true },
        select: {
          id: true,
          deviceId: true,
          deviceType: true,
          hyperParams: true,
          trainedAt: true,
          performance: true,
        },
        orderBy: { trainedAt: 'desc' },
      });

      return NextResponse.json({ data: models });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[API /api/anomalies/tuning GET] Error:', err);
    return NextResponse.json({ error: 'Gagal mengambil status tuning' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { action, deviceId, metric = 'f1', maxTrials = 30, timeoutMinutes = 20 } = body;

    if (action === 'tune' && deviceId) {
      const tuner = createAutoTuner(prisma, undefined, {
        metric: metric as 'f1' | 'precision' | 'recall' | 'accuracy',
        maxTrials,
        timeoutMinutes,
        cvFolds: 3,
      });

      const result = await tuner.tune(deviceId);
      const device = await prisma.device.findUnique({
        where: { id: deviceId },
        select: { type: true },
      });
      result.deviceType = device?.type || 'UNKNOWN';

      // Save best hyperparameters
      await prisma.anomalyModel.updateMany({
        where: { deviceId, isActive: true },
        data: {
          hyperParams: result.bestParams as any,
        },
      });

      return NextResponse.json({ success: true, data: result });
    }

    if (action === 'tune_all') {
      const tuner = createAutoTuner(prisma, undefined, {
        metric: metric as 'f1' | 'precision' | 'recall' | 'accuracy',
        maxTrials,
        timeoutMinutes,
      });

      const devices = await prisma.device.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });

      const results = await tuner.tuneAllDevices(devices.map(d => d.id));

      // Save best hyperparameters for all devices
      for (const [devId, result] of results) {
        await prisma.anomalyModel.updateMany({
          where: { deviceId: devId, isActive: true },
          data: { hyperParams: result.bestParams as any },
        });
      }

      return NextResponse.json({ success: true, tunedCount: results.size });
    }

    if (action === 'weekly') {
      await runWeeklyAutoTune(prisma);
      return NextResponse.json({ success: true, message: 'Weekly auto-tuning completed' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[API /api/anomalies/tuning POST] Error:', err);
    return NextResponse.json({ error: 'Gagal menjalankan tuning' }, { status: 500 });
  }
}