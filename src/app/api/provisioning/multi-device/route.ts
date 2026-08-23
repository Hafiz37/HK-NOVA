import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { executeMultiDeviceProvisioning, type MultiDeviceProvisioningInput } from '@/lib/multi-device-provisioning';
import { logAudit, getClientIp } from '@/lib/audit';
import { PROVISIONING_ACTIONS, type ProvisioningActionKey, type TemplateName, type ProvisioningFields } from '@/lib/olt-templates';
import { mapErrorToCode, getHttpStatusForError } from '@/lib/provisioning-errors';

/**
 * POST /api/provisioning/multi-device
 * Execute provisioning on multiple devices simultaneously
 * Body: { deviceIds: string[], action, template?, fields, dryRun?, continueOnError?, parallelExecution? }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa objek' }, { status: 400 });
    }

    const deviceIds = Array.isArray(body.deviceIds) ? body.deviceIds.filter((d: unknown): d is string => typeof d === 'string') : [];
    const action = typeof body.action === 'string' ? body.action : '';
    const template = typeof body.template === 'string' && body.template ? (body.template as TemplateName) : undefined;
    const dryRun = body.dryRun === true;
    const continueOnError = body.continueOnError !== false;
    const parallelExecution = body.parallelExecution !== false;

    if (deviceIds.length === 0) {
      return NextResponse.json({ error: 'Array deviceIds tidak boleh kosong' }, { status: 400 });
    }
    if (deviceIds.length > 20) {
      return NextResponse.json({ error: 'Maksimum 20 device per request multi-device' }, { status: 400 });
    }
    if (!PROVISIONING_ACTIONS.includes(action as ProvisioningActionKey)) {
      return NextResponse.json(
        { error: `Action harus salah satu dari: ${PROVISIONING_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const fields: ProvisioningFields = {
      ponPort: body.ponPort ?? undefined,
      ontSlot: body.ontSlot ?? undefined,
      ontSerial: body.ontSerial ?? undefined,
      vlan: body.vlan == null || body.vlan === '' ? undefined : Number(body.vlan),
      serviceProfile: body.serviceProfile ?? undefined,
      lineProfile: body.lineProfile ?? undefined,
      tcontProfile: body.tcontProfile ?? undefined,
      ontType: body.ontType ?? undefined,
      servicePort: body.servicePort ?? undefined,
    };

    if (fields.vlan !== undefined && (Number.isNaN(fields.vlan) || fields.vlan < 1 || fields.vlan > 4094)) {
      return NextResponse.json({ error: 'vlan harus berupa angka 1-4094' }, { status: 400 });
    }

    const input: MultiDeviceProvisioningInput = {
      deviceIds,
      action: action as ProvisioningActionKey,
      template,
      fields,
      executedBy: auth.user.id,
      dryRun,
      continueOnError,
      parallelExecution,
    };

    const result = await executeMultiDeviceProvisioning(prisma, input);

    await logAudit({
      action: 'EXECUTE',
      entity: 'ProvisioningLog',
      entityId: undefined,
      userId: auth.user.id,
      details: {
        type: 'multi_device',
        deviceIds,
        action,
        totalDevices: result.totalDevices,
        successCount: result.successCount,
        failedCount: result.failedCount,
        dryRun,
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      data: result,
      message: `Multi-device provisioning selesai (${result.successCount}/${result.totalDevices} sukses)`,
    });
  } catch (error) {
    console.error('[API /api/provisioning/multi-device POST] Error:', error);
    const provisioningError = mapErrorToCode(error);
    const status = getHttpStatusForError(provisioningError.code);
    return NextResponse.json(
      { error: provisioningError.userMessage, code: provisioningError.code },
      { status }
    );
  }
}