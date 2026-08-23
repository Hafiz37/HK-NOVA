import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { executeBatchProvisioning, type BatchProvisioningItem } from '@/lib/batch-provisioning';
import { logAudit, getClientIp } from '@/lib/audit';
import { PROVISIONING_ACTIONS, type ProvisioningActionKey, type TemplateName } from '@/lib/olt-templates';
import { mapErrorToCode, getHttpStatusForError } from '@/lib/provisioning-errors';

/**
 * POST /api/provisioning/batch-execute
 * Body: { deviceId, action, template?, items: [...], dryRun?, continueOnError?, parallelExecution? }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const userAgent = request.headers.get('user-agent') || undefined;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa objek' }, { status: 400 });
    }

    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const template = typeof body.template === 'string' && body.template ? (body.template as TemplateName) : undefined;
    const items = Array.isArray(body.items) ? (body.items as BatchProvisioningItem[]) : [];
    const dryRun = body.dryRun === true;
    const continueOnError = body.continueOnError !== false;
    const parallelExecution = body.parallelExecution === true;

    if (!deviceId) {
      return NextResponse.json({ error: 'Field deviceId wajib diisi' }, { status: 400 });
    }
    if (!PROVISIONING_ACTIONS.includes(action as ProvisioningActionKey)) {
      return NextResponse.json(
        { error: `Action harus salah satu dari: ${PROVISIONING_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }
    if (items.length === 0) {
      return NextResponse.json({ error: 'Array items tidak boleh kosong' }, { status: 400 });
    }
    if (items.length > 100) {
      return NextResponse.json({ error: 'Maksimum 100 item per batch request' }, { status: 400 });
    }

    const result = await executeBatchProvisioning(prisma, {
      deviceId,
      action: action as ProvisioningActionKey,
      template,
      items,
      executedBy: auth.user.id,
      dryRun,
      continueOnError,
      parallelExecution,
      clientIp,
      userAgent,
    });

    await logAudit({
      action: dryRun ? 'EXECUTE' : 'EXECUTE',
      entity: 'ProvisioningLog',
      entityId: result.batchId,
      userId: auth.user.id,
      details: {
        batchId: result.batchId,
        deviceId,
        action,
        totalItems: result.totalItems,
        successCount: result.successCount,
        failedCount: result.failedCount,
        status: result.status,
        dryRun,
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      data: result,
      message: `Batch provisioning selesai (${result.successCount}/${result.totalItems} sukses)`,
    });
  } catch (error) {
    console.error('[API /api/provisioning/batch-execute POST] Error:', error);
    const provisioningError = mapErrorToCode(error);
    const status = getHttpStatusForError(provisioningError.code);
    return NextResponse.json(
      { error: provisioningError.userMessage, code: provisioningError.code },
      { status }
    );
  }
}