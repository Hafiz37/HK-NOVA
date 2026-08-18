import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

function notFound(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Maintenance window tidak ditemukan' },
    { status: 404 }
  );
}

function internalError(err: unknown): NextResponse {
  console.error('[API /api/maintenance-windows/[id]] Error:', err);
  return NextResponse.json(
    { success: false, error: 'Gagal memproses maintenance window' },
    { status: 500 }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'maintenance:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const existing = await prisma.maintenanceWindow.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return notFound();

    await prisma.maintenanceWindow.delete({
      where: { id },
    });

    await logAudit({
      action: 'DELETE',
      entity: 'MaintenanceWindow',
      entityId: id,
      userId: auth.user.id,
      details: { removed: true },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true, message: 'Maintenance window berhasil dihapus' });
  } catch (err) {
    return internalError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'maintenance:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { isActive } = body;

    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'isActive harus bertipe boolean' },
        { status: 400 }
      );
    }

    const existing = await prisma.maintenanceWindow.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!existing) return notFound();

    const window = await prisma.maintenanceWindow.update({
      where: { id },
      data: { isActive },
    });

    await logAudit({
      action: 'UPDATE',
      entity: 'MaintenanceWindow',
      entityId: id,
      userId: auth.user.id,
      details: {
        before: { isActive: existing.isActive },
        after: { isActive },
        fieldsChanged: ['isActive'],
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true, data: window });
  } catch (err) {
    return internalError(err);
  }
}