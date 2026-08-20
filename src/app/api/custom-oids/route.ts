import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/audit';

/**
 * GET /api/custom-oids
 * Daftar custom OID aktif lintas device (dipakai dropdown pembuatan rule).
 * ADMIN only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  const rateLimitError = rateLimitResponse(RATE_LIMITS.read, 'custom-oids:read', getClientIp(request) || '127.0.0.1');
  if (rateLimitError) return rateLimitError;

  try {
    const oids = await prisma.customOid.findMany({
      where: { enabled: true },
      select: {
        id: true,
        name: true,
        oid: true,
        unit: true,
        alertHigh: true,
        alertLow: true,
        device: { select: { id: true, name: true, ip: true } },
      },
      orderBy: [{ device: { name: 'asc' } }, { name: 'asc' }],
    });
    return NextResponse.json({ data: oids });
  } catch (error) {
    console.error('[API /api/custom-oids GET] Error:', error);
    return NextResponse.json({ error: 'Gagal mengambil custom OID' }, { status: 500 });
  }
}