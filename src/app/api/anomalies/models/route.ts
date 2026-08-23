import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession, requireRole } from '@/lib/auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');

    const models = await prisma.anomalyModel.findMany({
      where: deviceId ? { deviceId, isActive: true } : { isActive: true },
      orderBy: { trainedAt: 'desc' },
      take: deviceId ? 5 : 50,
    });

    // Calculate aggregate stats
    const totalModels = await prisma.anomalyModel.count({ where: { isActive: true } });
    const byType = await prisma.anomalyModel.groupBy({
      by: ['deviceType'],
      where: { isActive: true },
      _count: true,
    });

    return NextResponse.json({
      data: {
        models,
        summary: {
          totalActiveModels: totalModels,
          byDeviceType: byType,
        },
      },
    });
  } catch (err) {
    console.error('[API /api/anomalies/models GET] Error:', err);
    return NextResponse.json({ error: 'Gagal mengambil model' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Model ID required' }, { status: 400 });
    }

    await prisma.anomalyModel.delete({ where: { id } });

    return NextResponse.json({ message: 'Model deleted' });
  } catch (err) {
    console.error('[API /api/anomalies/models DELETE] Error:', err);
    return NextResponse.json({ error: 'Gagal menghapus model' }, { status: 500 });
  }
}