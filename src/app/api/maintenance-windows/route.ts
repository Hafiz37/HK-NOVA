import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireSession, requireRole } from '@/lib/auth';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');

    const windows = await prisma.maintenanceWindow.findMany({
      where: deviceId ? { deviceId } : {},
      include: {
        device: {
          select: {
            id: true,
            name: true,
            ip: true,
          },
        },
      },
      orderBy: { startAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: windows });
  } catch (err) {
    console.error('[API /api/maintenance-windows GET] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data maintenance window' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'maintenance:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { deviceId, name, startAt, endAt, reason, suppressedTypes } = body;

    if (!name || !startAt || !endAt) {
      return NextResponse.json(
        { success: false, error: 'Field name, startAt, dan endAt wajib diisi' },
        { status: 400 }
      );
    }

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Format tanggal startAt/endAt tidak valid' },
        { status: 400 }
      );
    }
    if (end <= start) {
      return NextResponse.json(
        { success: false, error: 'endAt harus setelah startAt' },
        { status: 400 }
      );
    }

    const window = await prisma.maintenanceWindow.create({
      data: {
        deviceId: deviceId || null,
        name,
        startAt: start,
        endAt: end,
        reason: reason || null,
        suppressedTypes: suppressedTypes
          ? (suppressedTypes as unknown as import('@prisma/client').Prisma.InputJsonValue)
          : undefined,
      },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            ip: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: window });
  } catch (err) {
    console.error('[API /api/maintenance-windows POST] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal membuat maintenance window' },
      { status: 500 }
    );
  }
}