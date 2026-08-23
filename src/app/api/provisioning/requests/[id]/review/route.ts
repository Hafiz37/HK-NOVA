import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { reviewProvisioningRequest } from '@/lib/approval-workflow';
import { logAudit, getClientIp } from '@/lib/audit';
import { mapErrorToCode, getHttpStatusForError } from '@/lib/provisioning-errors';

/**
 * POST /api/provisioning/requests/:id/review
 * Review (approve/reject) a provisioning request
 * Body: { approve: boolean, rejectionReason?: string, dryRun?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object' || typeof body.approve !== 'boolean') {
      return NextResponse.json({ error: 'Field approve (boolean) wajib diisi' }, { status: 400 });
    }

    const approve = body.approve === true;
    const rejectionReason = typeof body.rejectionReason === 'string' ? body.rejectionReason : undefined;
    const dryRun = body.dryRun === true;

    const updated = await reviewProvisioningRequest(
      prisma,
      id,
      auth.user.id,
      approve,
      rejectionReason,
      dryRun
    );

    await logAudit({
      action: approve ? (dryRun ? 'EXECUTE' : 'EXECUTE') : 'UPDATE',
      entity: 'ProvisioningRequest',
      entityId: id,
      userId: auth.user.id,
      details: {
        approve,
        rejectionReason: rejectionReason ?? null,
        dryRun,
        status: updated.status,
      },
      ipAddress: clientIp,
    });

    const message = approve
      ? (dryRun ? 'Permintaan disetujui & dieksekusi mode dry-run' : 'Permintaan disetujui & dieksekusi')
      : 'Permintaan ditolak';

    return NextResponse.json({ data: updated, message });
  } catch (error) {
    console.error('[API /api/provisioning/requests/:id/review POST] Error:', error);
    const provisioningError = mapErrorToCode(error);
    const status = getHttpStatusForError(provisioningError.code);
    return NextResponse.json(
      { error: provisioningError.userMessage, code: provisioningError.code },
      { status }
    );
  }
}