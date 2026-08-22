import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { executeProvisioning } from '@/lib/provisioning';
import { PROVISIONING_ACTIONS, type ProvisioningFields } from '@/lib/olt-templates';

/**
 * POST /api/provisioning/execute
 * Body: { deviceId, action, template?, onSerial/ponPort/ontSlot/vlan/serviceProfile/..., dryRun? }
 * Runs an OLT provisioning workflow over SSH (or dry-run) and records it to ProvisioningLog.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const userAgent = request.headers.get('user-agent') || undefined;
  const rateLimitError = rateLimitResponse(RATE_LIMITS.provision, 'provisioning:execute', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa objek' }, { status: 400 });
    }

    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const template = typeof body.template === 'string' && body.template ? body.template : undefined;
    const dryRun = body.dryRun === true;

    if (!deviceId) {
      return NextResponse.json({ error: 'Field deviceId wajib diisi' }, { status: 400 });
    }
    if (!PROVISIONING_ACTIONS.includes(action as (typeof PROVISIONING_ACTIONS)[number])) {
      return NextResponse.json(
        { error: `Action harus salah satu dari: ${PROVISIONING_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const fields: ProvisioningFields = {
      ponPort: toStr(body.ponPort),
      ontSlot: toStr(body.ontSlot),
      ontSerial: toStr(body.ontSerial),
      vlan: body.vlan == null || body.vlan === '' ? undefined : Number(body.vlan),
      serviceProfile: toStr(body.serviceProfile),
      lineProfile: toStr(body.lineProfile),
      tcontProfile: toStr(body.tcontProfile),
      ontType: toStr(body.ontType),
      servicePort: toStr(body.servicePort),
    };

    if (fields.vlan !== undefined && (Number.isNaN(fields.vlan) || fields.vlan < 1 || fields.vlan > 4094)) {
      return NextResponse.json({ error: 'vlan harus berupa angka 1-4094' }, { status: 400 });
    }

    const result = await executeProvisioning(prisma, {
      deviceId,
      action,
      template,
      fields,
      executedBy: auth.user.id,
      dryRun,
      clientIp,
      userAgent,
    });

    await logAudit({
      action: 'EXECUTE',
      entity: 'ProvisioningLog',
      entityId: result.log?.id,
      userId: auth.user.id,
      details: {
        deviceId,
        action,
        template: template ?? null,
        dryRun,
        status: result.log?.status ?? 'N/A',
        error: result.error ?? null,
        executionMode: result.log?.executionMode ?? 'N/A',
        executionTimeMs: result.log?.executionTimeMs ?? null,
      },
      ipAddress: clientIp,
    });

    if (!result.ok) {
      if (result.fieldErrors && result.fieldErrors.length > 0) {
        return NextResponse.json({ error: result.error, details: result.fieldErrors }, { status: 400 });
      }
      const message = result.error ?? '';
      if (message.includes('Device not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message.includes('Field wajib') || message.includes('SSH credentials')) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      if (message.includes('feature flag')) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
      return NextResponse.json(
        { error: message || 'Provisioning gagal', data: result.log ?? null },
        { status: 502 }
      );
    }

    const message = dryRun ? 'Dry-run preview berhasil' : 'Provisioning berhasil dieksekusi';
    return NextResponse.json({ data: result.log, message });
  } catch (error) {
    console.error('[API /api/provisioning/execute] Error:', error);
    return NextResponse.json({ error: 'Failed to run provisioning' }, { status: 500 });
  }
}

function toStr(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
}