import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DeviceType, DeviceStatus, Prisma } from '@prisma/client';
import { encrypt } from '@/lib/encryption';
import { requireSession } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { normalizeThresholdInput } from '@/lib/thresholds';

/**
 * GET /api/devices?search=...&type=...&status=...&showDemo=true
 * Returns active devices with real-time status, latest latency, and packet loss.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search')?.trim();
    const typeParam = searchParams.get('type');
    const statusParam = searchParams.get('status');
    const showDemo = searchParams.get('showDemo') === 'true';

    const where: Prisma.DeviceWhereInput = { deletedAt: null };

    // Filter demo devices based on showDemo parameter
    if (!showDemo) {
      where.isDemo = false;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { ip: { contains: search } },
        { vendor: { contains: search } },
        { model: { contains: search } },
        { location: { contains: search } },
      ];
    }

    if (typeParam && Object.values(DeviceType).includes(typeParam as DeviceType)) {
      where.type = typeParam as DeviceType;
    }

    if (statusParam && Object.values(DeviceStatus).includes(statusParam as DeviceStatus)) {
      where.status = statusParam as DeviceStatus;
    }

    const devices = await prisma.device.findMany({
      where,
      select: {
        id: true,
        name: true,
        ip: true,
        type: true,
        vendor: true,
        model: true,
        location: true,
        status: true,
        description: true,
        isDemo: true,
        cpuThresholdOverride: true,
        memThresholdOverride: true,
        cpuResolveThresholdOverride: true,
        memResolveThresholdOverride: true,
        createdAt: true,
        updatedAt: true,
        metrics: {
          where: { metricType: 'ICMP' },
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: {
            latency: true,
            packetLoss: true,
            timestamp: true,
          },
        },
        alerts: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            type: true,
            severity: true,
            message: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const response = devices.map((device) => ({
      id: device.id,
      name: device.name,
      ip: device.ip,
      type: device.type,
      vendor: device.vendor,
      model: device.model,
      location: device.location,
      status: device.status,
      description: device.description,
      isDemo: device.isDemo,
      cpuThresholdOverride: device.cpuThresholdOverride,
      memThresholdOverride: device.memThresholdOverride,
      cpuResolveThresholdOverride: device.cpuResolveThresholdOverride,
      memResolveThresholdOverride: device.memResolveThresholdOverride,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
      latestLatency: device.metrics[0]?.latency ?? null,
      latestPacketLoss: device.metrics[0]?.packetLoss ?? null,
      lastCheck: device.metrics[0]?.timestamp ?? null,
      activeAlerts: device.alerts,
    }));

    return NextResponse.json({ data: response, count: response.length });
  } catch (error) {
    console.error('[API /api/devices GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch devices' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/devices
 * Creates a new network device.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      name, ip, type, vendor, model, location, description, credentials,
      cpuThresholdOverride,
      memThresholdOverride,
      cpuResolveThresholdOverride,
      memResolveThresholdOverride,
    } = body;

    // Basic Validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Device name is required' }, { status: 400 });
    }

    if (!ip || typeof ip !== 'string' || ip.trim() === '') {
      return NextResponse.json({ error: 'Device IP address is required' }, { status: 400 });
    }

    // Validate IP format (IPv4 or hostname/IPv6)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(ip.trim())) {
      return NextResponse.json({ error: 'Invalid IPv4 address format' }, { status: 400 });
    }

    if (!type || !Object.values(DeviceType).includes(type as DeviceType)) {
      return NextResponse.json({ error: 'Invalid or missing device type' }, { status: 400 });
    }

    // Check duplicate IP
    const existingDevice = await prisma.device.findFirst({
      where: { ip: ip.trim(), deletedAt: null },
    });

    if (existingDevice) {
      return NextResponse.json(
        { error: `Device with IP ${ip} already exists (${existingDevice.name})` },
        { status: 409 }
      );
    }

    // Create device with optional credentials
    const newDevice = await prisma.device.create({
      data: {
        name: name.trim(),
        ip: ip.trim(),
        type: type as DeviceType,
        vendor: vendor?.trim() || null,
        model: model?.trim() || null,
        location: location?.trim() || null,
        description: description?.trim() || null,
        status: 'UNKNOWN',
        cpuThresholdOverride: normalizeThresholdInput(cpuThresholdOverride),
        memThresholdOverride: normalizeThresholdInput(memThresholdOverride),
        cpuResolveThresholdOverride: normalizeThresholdInput(cpuResolveThresholdOverride),
        memResolveThresholdOverride: normalizeThresholdInput(memResolveThresholdOverride),
        ...(credentials
          ? {
              credentials: {
                create: {
                  snmpVersion: credentials.snmpVersion || 'v2c',
                  snmpCommunity: credentials.snmpCommunity ? encrypt(credentials.snmpCommunity) : null,
                  snmpPort: credentials.snmpPort ? Number(credentials.snmpPort) : 161,
                  snmpUser: credentials.snmpUser || null,
                  snmpAuthPass: credentials.snmpAuthPass ? encrypt(credentials.snmpAuthPass) : null,
                  snmpPrivPass: credentials.snmpPrivPass ? encrypt(credentials.snmpPrivPass) : null,
                  sshUsername: credentials.sshUsername || null,
                  sshPassword: credentials.sshPassword ? encrypt(credentials.sshPassword) : null,
                  sshPort: credentials.sshPort ? Number(credentials.sshPort) : 22,
                },
              },
            }
          : {}),
      },
      include: {
        credentials: true,
      },
    });

    // Don't expose credentials in response (security)
    const sanitizedDevice = {
      id: newDevice.id,
      name: newDevice.name,
      ip: newDevice.ip,
      type: newDevice.type,
      vendor: newDevice.vendor,
      model: newDevice.model,
      location: newDevice.location,
      status: newDevice.status,
      description: newDevice.description,
      cpuThresholdOverride: newDevice.cpuThresholdOverride,
      memThresholdOverride: newDevice.memThresholdOverride,
      cpuResolveThresholdOverride: newDevice.cpuResolveThresholdOverride,
      memResolveThresholdOverride: newDevice.memResolveThresholdOverride,
      createdAt: newDevice.createdAt,
      updatedAt: newDevice.updatedAt,
    };

    await logAudit({
      action: 'CREATE',
      entity: 'Device',
      entityId: newDevice.id,
      userId: auth.user.id,
      details: {
        after: sanitizedDevice,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ data: sanitizedDevice, message: 'Device created successfully' }, { status: 201 });
  } catch (error) {
    console.error('[API /api/devices POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create device' },
      { status: 500 }
    );
  }
}
