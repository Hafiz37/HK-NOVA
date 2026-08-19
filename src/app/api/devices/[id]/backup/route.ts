import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { performBackup } from '@/lib/backup';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/devices/[id]/backup
 * Triggers an on-demand config backup for a device (OPERATOR/ADMIN).
 */
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.provision, 'backup:trigger', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    const device = await prisma.device.findFirst({
      where: { id, deletedAt: null },
      include: { credentials: true },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const result = await performBackup(prisma, device);

    await logAudit({
      action: 'BACKUP',
      entity: 'Backup',
      entityId: id,
      userId: auth.user.id,
      details: {
        result: { status: result.status, saved: result.saved, changed: result.changed, hash: result.hash ?? null },
        deviceName: device.name,
        ip: device.ip,
      },
      ipAddress: getClientIp(request),
    });

    if (result.status === 'FAILED') {
      const isConfigError = (result.errorMessage ?? '').includes('SSH credentials');
      return NextResponse.json(
        {
          data: result,
          error: result.errorMessage || 'Backup gagal',
        },
        { status: isConfigError ? 400 : 502 }
      );
    }

    return NextResponse.json({
      data: result,
      message: result.changed
        ? 'Backup berhasil — konfigurasi perangkat berubah dan snapshot baru disimpan'
        : 'Backup berhasil — tidak ada perubahan konfigurasi (snapshot identik dilewati)',
    });
  } catch (error) {
    console.error('[API /api/devices/[id]/backup] Error:', error);
    return NextResponse.json({ error: 'Failed to run backup' }, { status: 500 });
  }
}