import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession, requireRole } from '@/lib/auth';
import { parsePositiveIntParam } from '@/lib/utils';
import { RealtimeEmitter } from '@/lib/realtime';

/**
 * GET /api/anomalies?deviceId=&severity=&startDate=&endDate=&page=&limit=
 * Returns the anomaly detection history (newest first). Any authenticated user.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId') ?? undefined;
    const severity = searchParams.get('severity') ?? undefined;
    const startDate = searchParams.get('startDate') ?? undefined;
    const endDate = searchParams.get('endDate') ?? undefined;
    const page = parsePositiveIntParam(searchParams.get('page'), 1, 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePositiveIntParam(searchParams.get('limit'), 50, 1, 100);

    const where: {
      deviceId?: string;
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      timestamp?: { gte?: Date; lte?: Date };
    } = {};

    if (deviceId) where.deviceId = deviceId;
    if (severity) where.severity = severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    const [anomalies, total] = await Promise.all([
      prisma.anomaly.findMany({
        where,
        include: {
          device: {
            select: { id: true, name: true, ip: true, type: true, location: true },
          },
        },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.anomaly.count({ where }),
    ]);

    return NextResponse.json({
      data: anomalies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[API /api/anomalies GET] Error:', err);
    return NextResponse.json({ error: 'Gagal mengambil data anomali' }, { status: 500 });
  }
}

/**
 * DELETE /api/anomalies?id=xxx — Hapus catatan anomali (admin only).
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    const anomaly = await prisma.anomaly.findUnique({ where: { id } });

    await prisma.anomaly.delete({ where: { id } });

    if (anomaly) {
      RealtimeEmitter.anomalyDeleted(id, auth.user.id);
    }

    return NextResponse.json({ message: 'Anomaly deleted' }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Anomaly not found' }, { status: 404 });
    }
    console.error('[API /api/anomalies DELETE] Error:', err);
    return NextResponse.json({ error: 'Gagal menghapus anomali' }, { status: 500 });
  }
}