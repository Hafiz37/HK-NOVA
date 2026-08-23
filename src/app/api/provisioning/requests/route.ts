import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { createProvisioningRequest } from '@/lib/approval-workflow';
import { logAudit, getClientIp } from '@/lib/audit';
import { PROVISIONING_ACTIONS, type ProvisioningActionKey, type TemplateName, type ProvisioningFields } from '@/lib/olt-templates';
import { mapErrorToCode, getHttpStatusForError } from '@/lib/provisioning-errors';

/**
 * GET /api/provisioning/requests?status=&deviceId=&page=&limit=
 * List provisioning requests
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const deviceId = searchParams.get('deviceId');
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '20');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (deviceId) where.deviceId = deviceId;

    const [requests, total] = await Promise.all([
      prisma.provisioningRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          device: { select: { id: true, name: true, ip: true, vendor: true } },
          log: { select: { id: true, status: true, executionMode: true } },
        },
      }),
      prisma.provisioningRequest.count({ where }),
    ]);

    return NextResponse.json({
      data: requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[API /api/provisioning/requests GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch provisioning requests' }, { status: 500 });
  }
}

/**
 * POST /api/provisioning/requests
 * Submit a new provisioning request for approval
 * Body: { deviceId, action, template?, fields }
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

    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const template = typeof body.template === 'string' && body.template ? (body.template as TemplateName) : undefined;

    if (!deviceId) {
      return NextResponse.json({ error: 'Field deviceId wajib diisi' }, { status: 400 });
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

    const provRequest = await createProvisioningRequest(prisma, {
      deviceId,
      action: action as ProvisioningActionKey,
      template,
      fields,
      requestedBy: auth.user.id,
    });

    await logAudit({
      action: 'CREATE',
      entity: 'ProvisioningRequest',
      entityId: provRequest.id,
      userId: auth.user.id,
      details: { deviceId, action, status: 'PENDING' },
      ipAddress: clientIp,
    });

    return NextResponse.json({ data: provRequest, message: 'Permintaan provisioning berhasil dikirim untuk review' });
  } catch (error) {
    console.error('[API /api/provisioning/requests POST] Error:', error);
    const provisioningError = mapErrorToCode(error);
    const status = getHttpStatusForError(provisioningError.code);
    return NextResponse.json(
      { error: provisioningError.userMessage, code: provisioningError.code },
      { status }
    );
  }
}