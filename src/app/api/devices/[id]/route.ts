import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DeviceType, DeviceStatus, UserRole } from '@prisma/client';
import { encrypt } from '@/lib/encryption';
import { requireSession, requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/devices/[id]
 * Fetch a single device with details, credentials (masked), recent metrics, and alerts.
 */
export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    const device = await prisma.device.findFirst({
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

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Mask sensitive credential fields
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

    return NextResponse.json({ data: sanitizedDevice });
  } catch (error) {
    console.error('[API /api/devices/[id] GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch device details' }, { status: 500 });
  }
}

/**
 * PUT /api/devices/[id] or PATCH /api/devices/[id]
 * Update device details or status.
 */
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  return updateDevice(request, params, auth);
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  return updateDevice(request, params, auth);
}

async function updateDevice(request: NextRequest, paramsPromise: Promise<{ id: string }>, auth: { ok: true; user: { id: string } }): Promise<NextResponse> {
  try {
    const { id } = await paramsPromise;
    const body = await request.json();
    const { name, ip, type, vendor, model, location, status, description, credentials } = body;

    const existing = await prisma.device.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Capture before state for audit log
    const before = {
      name: existing.name,
      ip: existing.ip,
      type: existing.type,
      vendor: existing.vendor,
      model: existing.model,
      location: existing.location,
      status: existing.status,
      description: existing.description,
    };

    if (ip && ip !== existing.ip) {
      const ipCheck = await prisma.device.findFirst({
        where: { ip: ip.trim(), deletedAt: null, id: { not: id } },
      });
      if (ipCheck) {
        return NextResponse.json({ error: `IP ${ip} is already used by another device` }, { status: 409 });
      }
    }

    const updated = await prisma.device.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(ip ? { ip: ip.trim() } : {}),
        ...(type && Object.values(DeviceType).includes(type) ? { type: type as DeviceType } : {}),
        ...(vendor !== undefined ? { vendor: vendor ? vendor.trim() : null } : {}),
        ...(model !== undefined ? { model: model ? model.trim() : null } : {}),
        ...(location !== undefined ? { location: location ? location.trim() : null } : {}),
        ...(status && Object.values(DeviceStatus).includes(status) ? { status: status as DeviceStatus } : {}),
        ...(description !== undefined ? { description: description ? description.trim() : null } : {}),
        ...(credentials
          ? {
              credentials: {
                upsert: {
                  create: {
                    snmpVersion: credentials.snmpVersion || 'v2c',
                    snmpCommunity: credentials.snmpCommunity ? encrypt(credentials.snmpCommunity) : null,
                    snmpUser: credentials.snmpUser || null,
                    snmpAuthPass: credentials.snmpAuthPass ? encrypt(credentials.snmpAuthPass) : null,
                    snmpPrivPass: credentials.snmpPrivPass ? encrypt(credentials.snmpPrivPass) : null,
                    sshUsername: credentials.sshUsername || null,
                    sshPassword: credentials.sshPassword ? encrypt(credentials.sshPassword) : null,
                    sshPort: credentials.sshPort ? Number(credentials.sshPort) : 22,
                  },
                  update: {
                    ...(credentials.snmpVersion !== undefined ? { snmpVersion: credentials.snmpVersion } : {}),
                    ...(credentials.snmpCommunity !== undefined ? { snmpCommunity: credentials.snmpCommunity ? encrypt(credentials.snmpCommunity) : null } : {}),
                    ...(credentials.snmpUser !== undefined ? { snmpUser: credentials.snmpUser } : {}),
                    ...(credentials.snmpAuthPass !== undefined ? { snmpAuthPass: credentials.snmpAuthPass ? encrypt(credentials.snmpAuthPass) : null } : {}),
                    ...(credentials.snmpPrivPass !== undefined ? { snmpPrivPass: credentials.snmpPrivPass ? encrypt(credentials.snmpPrivPass) : null } : {}),
                    ...(credentials.sshUsername !== undefined ? { sshUsername: credentials.sshUsername } : {}),
                    ...(credentials.sshPassword !== undefined ? { sshPassword: credentials.sshPassword ? encrypt(credentials.sshPassword) : null } : {}),
                    ...(credentials.sshPort !== undefined ? { sshPort: Number(credentials.sshPort) } : {}),
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

    // Sanitize credentials in response (don't expose encrypted values)
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
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    // Determine fields changed
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

    return NextResponse.json({ data: sanitizedUpdated, message: 'Device updated successfully' });
  } catch (error) {
    console.error('[API /api/devices/[id] PUT/PATCH] Error:', error);
    return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
  }
}

/**
 * DELETE /api/devices/[id]
 * Soft delete a device. Requires ADMIN role.
 */
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    const existing = await prisma.device.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
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

    return NextResponse.json({ message: `Device ${existing.name} deleted successfully` });
  } catch (error) {
    console.error('[API /api/devices/[id] DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
  }
}
