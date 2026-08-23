import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DeviceType, DeviceStatus, UserRole } from '@prisma/client';
import { encrypt } from '@/lib/encryption';
import { requireSession, requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { normalizeThresholdInput } from '@/lib/thresholds';
import { isValidIpv4 } from '@/lib/utils';
import { updateDeviceSchema, deviceIdSchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, NotFoundError, ConflictError, InternalServerError } from '@/lib/api-response';
import { cacheGetOrSet, CacheTags, invalidateOnMutation } from '@/lib/query';
import { RealtimeEmitter } from '@/lib/realtime';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    deviceIdSchema.parse({ id });

    const cacheKey = `devices:detail:${id}`;

    const device = await cacheGetOrSet(
      cacheKey,
      async () => {
        return prisma.device.findFirst({
          where: { id, deletedAt: null },
          include: {
            credentials: true,
            metrics: {
              orderBy: { timestamp: 'desc' },
              take: 20,
            },
            alerts: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        });
      },
      { ttl: 120, tags: [CacheTags.DEVICE(id)] }
    );

    if (!device) {
      throw new NotFoundError('Device', id);
    }

    const sanitizedDevice = {
      ...device,
      credentials: device.credentials ? {
        id: device.credentials.id,
        deviceId: device.credentials.deviceId,
        snmpVersion: device.credentials.snmpVersion,
        snmpCommunity: device.credentials.snmpCommunity ? '***MASKED***' : null,
        snmpUser: device.credentials.snmpUser,
        snmpAuthPass: device.credentials.snmpAuthPass ? '***MASKED***' : null,
        snmpPrivPass: device.credentials.snmpPrivPass ? '***MASKED***' : null,
        sshUsername: device.credentials.sshUsername,
        sshPassword: device.credentials.sshPassword ? '***MASKED***' : null,
        sshPort: device.credentials.sshPort,
        createdAt: device.credentials.createdAt,
        updatedAt: device.credentials.updatedAt,
      } : null,
    };

    return NextResponse.json(success(sanitizedDevice));
  } catch (err) {
    console.error('[API /api/devices/[id] GET] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(_request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(_request.nextUrl.pathname), { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'devices:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;
  return updateDevice(request, params, auth);
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'devices:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;
  return updateDevice(request, params, auth);
}

async function updateDevice(request: NextRequest, paramsPromise: Promise<{ id: string }>, auth: { ok: true; user: { id: string } }): Promise<NextResponse> {
  try {
    const { id } = await paramsPromise;
    deviceIdSchema.parse({ id });

    const body = await request.json();
    const validatedData = updateDeviceSchema.parse(body);

    const existing = await prisma.device.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Device', id);
    }

    const before = {
      name: existing.name,
      ip: existing.ip,
      type: existing.type,
      vendor: existing.vendor,
      model: existing.model,
      location: existing.location,
      status: existing.status,
      description: existing.description,
      cpuThresholdOverride: existing.cpuThresholdOverride,
      memThresholdOverride: existing.memThresholdOverride,
      cpuResolveThresholdOverride: existing.cpuResolveThresholdOverride,
      memResolveThresholdOverride: existing.memResolveThresholdOverride,
    };

    if (validatedData.ip && validatedData.ip !== existing.ip) {
      if (!isValidIpv4(validatedData.ip.trim())) {
        throw new ValidationError('Invalid IPv4 address format');
      }
      const ipCheck = await prisma.device.findFirst({
        where: { ip: validatedData.ip.trim(), deletedAt: null, id: { not: id } },
      });
      if (ipCheck) {
        throw new ConflictError(`IP ${validatedData.ip} is already used by another device`);
      }
    }

    const updated = await prisma.device.update({
      where: { id },
      data: {
        ...(validatedData.name ? { name: validatedData.name.trim() } : {}),
        ...(validatedData.ip ? { ip: validatedData.ip.trim() } : {}),
        ...(validatedData.type ? { type: validatedData.type } : {}),
        ...(validatedData.vendor !== undefined ? { vendor: validatedData.vendor ? validatedData.vendor.trim() : null } : {}),
        ...(validatedData.model !== undefined ? { model: validatedData.model ? validatedData.model.trim() : null } : {}),
        ...(validatedData.location !== undefined ? { location: validatedData.location ? validatedData.location.trim() : null } : {}),
        ...(validatedData.status ? { status: validatedData.status } : {}),
        ...(validatedData.description !== undefined ? { description: validatedData.description ? validatedData.description.trim() : null } : {}),
        ...(validatedData.cpuThresholdOverride !== undefined ? { cpuThresholdOverride: normalizeThresholdInput(validatedData.cpuThresholdOverride) } : {}),
        ...(validatedData.memThresholdOverride !== undefined ? { memThresholdOverride: normalizeThresholdInput(validatedData.memThresholdOverride) } : {}),
        ...(validatedData.cpuResolveThresholdOverride !== undefined ? { cpuResolveThresholdOverride: normalizeThresholdInput(validatedData.cpuResolveThresholdOverride) } : {}),
        ...(validatedData.memResolveThresholdOverride !== undefined ? { memResolveThresholdOverride: normalizeThresholdInput(validatedData.memResolveThresholdOverride) } : {}),
        ...(validatedData.credentials
          ? {
              credentials: {
                upsert: {
                  create: {
                    snmpVersion: validatedData.credentials.snmpVersion || 'v2c',
                    snmpCommunity: validatedData.credentials.snmpCommunity ? encrypt(validatedData.credentials.snmpCommunity) : null,
                    snmpUser: validatedData.credentials.snmpUser || null,
                    snmpAuthPass: validatedData.credentials.snmpAuthPass ? encrypt(validatedData.credentials.snmpAuthPass) : null,
                    snmpPrivPass: validatedData.credentials.snmpPrivPass ? encrypt(validatedData.credentials.snmpPrivPass) : null,
                    sshUsername: validatedData.credentials.sshUsername || null,
                    sshPassword: validatedData.credentials.sshPassword ? encrypt(validatedData.credentials.sshPassword) : null,
                    sshPort: validatedData.credentials.sshPort ? Number(validatedData.credentials.sshPort) : 22,
                  },
                  update: {
                    ...(validatedData.credentials.snmpVersion !== undefined ? { snmpVersion: validatedData.credentials.snmpVersion } : {}),
                    ...(validatedData.credentials.snmpCommunity !== undefined ? { snmpCommunity: validatedData.credentials.snmpCommunity ? encrypt(validatedData.credentials.snmpCommunity) : null } : {}),
                    ...(validatedData.credentials.snmpUser !== undefined ? { snmpUser: validatedData.credentials.snmpUser } : {}),
                    ...(validatedData.credentials.snmpAuthPass !== undefined ? { snmpAuthPass: validatedData.credentials.snmpAuthPass ? encrypt(validatedData.credentials.snmpAuthPass) : null } : {}),
                    ...(validatedData.credentials.snmpPrivPass !== undefined ? { snmpPrivPass: validatedData.credentials.snmpPrivPass ? encrypt(validatedData.credentials.snmpPrivPass) : null } : {}),
                    ...(validatedData.credentials.sshUsername !== undefined ? { sshUsername: validatedData.credentials.sshUsername } : {}),
                    ...(validatedData.credentials.sshPassword !== undefined ? { sshPassword: validatedData.credentials.sshPassword ? encrypt(validatedData.credentials.sshPassword) : null } : {}),
                    ...(validatedData.credentials.sshPort !== undefined ? { sshPort: Number(validatedData.credentials.sshPort) } : {}),
                  },
                },
              },
            }
          : {}),
      },
      include: {
        credentials: true,
      },
    });

    const sanitizedUpdated = {
      id: updated.id,
      name: updated.name,
      ip: updated.ip,
      type: updated.type,
      vendor: updated.vendor,
      model: updated.model,
      location: updated.location,
      status: updated.status,
      description: updated.description,
      cpuThresholdOverride: updated.cpuThresholdOverride,
      memThresholdOverride: updated.memThresholdOverride,
      cpuResolveThresholdOverride: updated.cpuResolveThresholdOverride,
      memResolveThresholdOverride: updated.memResolveThresholdOverride,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    const fieldsChanged: string[] = [];
    (Object.keys(before) as Array<keyof typeof before>).forEach((key) => {
      if (before[key] !== sanitizedUpdated[key]) {
        fieldsChanged.push(key);
      }
    });

    await logAudit({
      action: 'UPDATE',
      entity: 'Device',
      entityId: id,
      userId: auth.user.id,
      details: {
        before,
        after: sanitizedUpdated,
        fieldsChanged,
      },
      ipAddress: getClientIp(request),
    });

    await invalidateOnMutation('devices', id);

    const statusChanged = before.status !== sanitizedUpdated.status;

    RealtimeEmitter.deviceUpdated({
      id: updated.id,
      name: updated.name,
      ip: updated.ip,
      type: updated.type,
      status: updated.status,
      vendor: updated.vendor,
      location: updated.location,
    }, auth.user.id);

    if (statusChanged) {
      RealtimeEmitter.deviceStatusChanged({
        id: updated.id,
        name: updated.name,
        ip: updated.ip,
        type: updated.type,
        status: updated.status,
        vendor: updated.vendor,
        location: updated.location,
      }, auth.user.id);
    }

    return NextResponse.json(success(sanitizedUpdated, { message: 'Device updated successfully' }));
  } catch (err) {
    console.error('[API /api/devices/[id] PUT/PATCH] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'devices:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    deviceIdSchema.parse({ id });

    const existing = await prisma.device.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Device', id);
    }

    const before = {
      id: existing.id,
      name: existing.name,
      ip: existing.ip,
      type: existing.type,
      vendor: existing.vendor,
      model: existing.model,
      location: existing.location,
      status: existing.status,
      description: existing.description,
    };

    await prisma.device.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      action: 'DELETE',
      entity: 'Device',
      entityId: id,
      userId: auth.user.id,
      details: {
        before,
      },
      ipAddress: getClientIp(request),
    });

    await invalidateOnMutation('devices', id);

    RealtimeEmitter.deviceDeleted(id, auth.user.id);

    return NextResponse.json(success(null, { message: `Device ${existing.name} deleted successfully` }));
  } catch (err) {
    console.error('[API /api/devices/[id] DELETE] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}