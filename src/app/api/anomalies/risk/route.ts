import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession, requireRole } from '@/lib/auth';
import { createForecastModel, trainForecastModel, predictRisk } from '@/lib/algorithms';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const horizonMinutes = parseInt(searchParams.get('horizonMinutes') || '60');
    const action = searchParams.get('action') || 'predict';

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    const forecastModel = createForecastModel({ horizonMinutes });

    if (action === 'predict') {
      const prediction = await predictRisk(forecastModel, prisma, deviceId, horizonMinutes);
      return NextResponse.json({ data: prediction });
    }

    if (action === 'train') {
      await trainForecastModel(forecastModel, prisma, deviceId, horizonMinutes);
      return NextResponse.json({
        success: true,
        performance: forecastModel.performance,
        lastTrained: forecastModel.lastTrained,
      });
    }

    if (action === 'bulk') {
      // Get risk for all devices
      const devices = await prisma.device.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      });

      const predictions = await Promise.all(
        devices.map(async (d) => {
          const pred = await predictRisk(forecastModel, prisma, d.id, horizonMinutes);
          return pred ? { deviceName: d.name, ...pred } : null;
        })
      );

      const validPredictions = predictions.filter(Boolean);
      return NextResponse.json({ data: validPredictions });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[API /api/anomalies/risk GET] Error:', err);
    return NextResponse.json({ error: 'Gagal memprediksi risiko' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { deviceId, horizonMinutes = 60 } = body;

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    const forecastModel = createForecastModel({ horizonMinutes });
    await trainForecastModel(forecastModel, prisma, deviceId, horizonMinutes);

    return NextResponse.json({
      success: true,
      performance: forecastModel.performance,
      lastTrained: forecastModel.lastTrained,
    });
  } catch (err) {
    console.error('[API /api/anomalies/risk POST] Error:', err);
    return NextResponse.json({ error: 'Gagal melatih model risiko' }, { status: 500 });
  }
}