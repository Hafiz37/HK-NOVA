import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { executeRollback } from '@/lib/rollback';
import { logAudit, getClientIp } from '@/lib/audit';
import { mapErrorToCode, getHttpStatusForError } from '@/lib/provisioning-errors';

/**
 * POST /api/provisioning/logs/:id/rollback
 * Execute rollback for a provisioning action
 * Body: { dryRun?: boolean, reason?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);

    const dryRun = body?.dryRun === true;
    const reason = typeof body?.reason === 'string' ? body.reason : undefined;

    const result = await executeRollback(prisma, id, auth.user.id, dryRun, reason);

    await logAudit({
      action: dryRun ? 'ROLLBACK_PREVIEW' : 'ROLLBACK_EXECUTE',
      entity: 'ProvisioningLog',
      entityId: result.rollbackLogId ?? id,
      userId: auth.user.id,
      details: {
        originalLogId: id,
        rollbackLogId: result.rollbackLogId ?? null,
        dryRun,
        reason: reason ?? null,
        success: result.ok,
        error: result.error ?? null,
      },
      ipAddress: getClientIp(request),
    });

    if (!result.ok) {
      const provisioningError = mapErrorToCode(result.error ?? 'Rollback failed');
      const status = getHttpStatusForError(provisioningError.code);
      return NextResponse.json(
        {
          error: provisioningError.userMessage,
          code: provisioningError.code,
          recoverable: provisioningError.recoverable,
          originalLogId: result.originalLogId,
        },
        { status }
      );
    }

    const message = dryRun ? 'Rollback preview berhasil' : 'Rollback berhasil dieksekusi';
    return NextResponse.json({
      data: { rollbackLogId: result.rollbackLogId, originalLogId: result.originalLogId },
      message,
    });
  } catch (error) {
    console.error('[API /api/provisioning/logs/:id/rollback POST] Error:', error);
    const provisioningError = mapErrorToCode(error);
    const status = getHttpStatusForError(provisioningError.code);
    return NextResponse.json(
      { error: provisioningError.userMessage, code: provisioningError.code },
      { status }
    );
  }
}