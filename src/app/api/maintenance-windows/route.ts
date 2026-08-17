import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

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
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSession();
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

    const window = await prisma.maintenanceWindow.create({
      data: {
        deviceId: deviceId || null,
        name,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
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
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}