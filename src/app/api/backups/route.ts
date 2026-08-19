import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { parsePositiveIntParam } from '@/lib/utils';

/**
 * GET /api/backups?deviceId=&page=&limit=
 * Returns the backup snapshot history (newest first).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const page = parsePositiveIntParam(searchParams.get('page'), 1, 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePositiveIntParam(searchParams.get('limit'), 20, 1, 100);

    const where = deviceId ? { deviceId } : {};

    const [backups, total] = await Promise.all([
      prisma.backup.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          device: {
            select: { id: true, name: true, ip: true, type: true, vendor: true },
          },
        },
      }),
      prisma.backup.count({ where }),
    ]);

    return NextResponse.json({
      data: backups,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[API /api/backups GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch backups' }, { status: 500 });
  }
}