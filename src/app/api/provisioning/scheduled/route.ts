import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { createScheduledProvisioning } from '@/lib/scheduled-provisioning';
import { logAudit, getClientIp } from '@/lib/audit';
import { PROVISIONING_ACTIONS, type ProvisioningActionKey, type TemplateName, type ProvisioningFields } from '@/lib/olt-templates';
import { mapErrorToCode, getHttpStatusForError } from '@/lib/provisioning-errors';

/**
 * GET /api/provisioning/scheduled?deviceId=&status=&page=&limit=
 * List scheduled provisioning jobs
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '20');

    const where: Record<string, unknown> = {};
    if (deviceId) where.deviceId = deviceId;
    if (status) where.status = status;

    const [jobs, total] = await Promise.all([
      prisma.scheduledProvisioning.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          device: { select: { id: true, name: true, ip: true, vendor: true } },
          log: { select: { id: true, status: true } },
        },
      }),
      prisma.scheduledProvisioning.count({ where }),
    ]);

    return NextResponse.json({
      data: jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[API /api/provisioning/scheduled GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch scheduled jobs' }, { status: 500 });
  }
}

/**
 * POST /api/provisioning/scheduled
 * Create a new scheduled provisioning job
 * Body: { deviceId, action, template?, fields, scheduledAt }
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
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    if (!deviceId) {
      return NextResponse.json({ error: 'Field deviceId wajib diisi' }, { status: 400 });
    }
    if (!PROVISIONING_ACTIONS.includes(action as ProvisioningActionKey)) {
      return NextResponse.json(
        { error: `Action harus salah satu dari: ${PROVISIONING_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }
    if (!scheduledAt || isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: 'Field scheduledAt wajib diisi dengan format ISO 8601' }, { status: 400 });
    }
    if (scheduledAt <= new Date()) {
      return NextResponse.json({ error: 'scheduledAt harus di masa depan' }, { status: 400 });
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

    const job = await createScheduledProvisioning(prisma, {
      deviceId,
      action: action as ProvisioningActionKey,
      template,
      fields,
      scheduledAt,
      createdBy: auth.user.id,
    });

    await logAudit({
      action: 'CREATE',
      entity: 'ScheduledProvisioning',
      entityId: job.id,
      userId: auth.user.id,
      details: { deviceId, action, scheduledAt: scheduledAt.toISOString() },
      ipAddress: clientIp,
    });

    return NextResponse.json({ data: job, message: 'Scheduled provisioning berhasil dibuat' });
  } catch (error) {
    console.error('[API /api/provisioning/scheduled POST] Error:', error);
    const provisioningError = mapErrorToCode(error);
    const status = getHttpStatusForError(provisioningError.code);
    return NextResponse.json(
      { error: provisioningError.userMessage, code: provisioningError.code },
      { status }
    );
  }
}