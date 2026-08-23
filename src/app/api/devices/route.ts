import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DeviceType, DeviceStatus, UserRole, Prisma } from '@prisma/client';
import { encrypt } from '@/lib/encryption';
import { requireSession, requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { normalizeThresholdInput } from '@/lib/thresholds';
import { queryDeviceSchema, createDeviceSchema } from '@/lib/schemas';
import { success, error, paginated, ApiError, ValidationError, NotFoundError, ConflictError, InternalServerError } from '@/lib/api-response';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = queryDeviceSchema.parse(Object.fromEntries(searchParams));

    const where: Prisma.DeviceWhereInput = { deletedAt: null };

    if (!query.showDemo) {
      where.isDemo = false;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { ip: { contains: query.search } },
        { vendor: { contains: query.search } },
        { model: { contains: query.search } },
        { location: { contains: query.search } },
      ];
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [devices, total] = await Promise.all([
      prisma.device.findMany({
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
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.device.count({ where }),
    ]);

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

    return NextResponse.json(paginated(response, query.page, query.limit, total));
  } catch (err) {
    console.error('[API /api/devices GET] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'devices:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validatedData = createDeviceSchema.parse(body);

    const existingDevice = await prisma.device.findFirst({
      where: { ip: validatedData.ip, deletedAt: null },
    });

    if (existingDevice) {
      throw new ConflictError(`Device with IP ${validatedData.ip} already exists (${existingDevice.name})`);
    }

    const newDevice = await prisma.device.create({
      data: {
        name: validatedData.name.trim(),
        ip: validatedData.ip.trim(),
        type: validatedData.type,
        vendor: validatedData.vendor?.trim() || null,
        model: validatedData.model?.trim() || null,
        location: validatedData.location?.trim() || null,
        description: validatedData.description?.trim() || null,
        status: 'UNKNOWN',
        cpuThresholdOverride: normalizeThresholdInput(validatedData.cpuThresholdOverride),
        memThresholdOverride: normalizeThresholdInput(validatedData.memThresholdOverride),
        cpuResolveThresholdOverride: normalizeThresholdInput(validatedData.cpuResolveThresholdOverride),
        memResolveThresholdOverride: normalizeThresholdInput(validatedData.memResolveThresholdOverride),
        ...(validatedData.credentials
          ? {
              credentials: {
                create: {
                  snmpVersion: validatedData.credentials.snmpVersion || 'v2c',
                  snmpCommunity: validatedData.credentials.snmpCommunity ? encrypt(validatedData.credentials.snmpCommunity) : null,
                  snmpPort: validatedData.credentials.snmpPort ? Number(validatedData.credentials.snmpPort) : 161,
                  snmpUser: validatedData.credentials.snmpUser || null,
                  snmpAuthPass: validatedData.credentials.snmpAuthPass ? encrypt(validatedData.credentials.snmpAuthPass) : null,
                  snmpPrivPass: validatedData.credentials.snmpPrivPass ? encrypt(validatedData.credentials.snmpPrivPass) : null,
                  sshUsername: validatedData.credentials.sshUsername || null,
                  sshPassword: validatedData.credentials.sshPassword ? encrypt(validatedData.credentials.sshPassword) : null,
                  sshPort: validatedData.credentials.sshPort ? Number(validatedData.credentials.sshPort) : 22,
                },
              },
            }
          : {}),
      },
      include: {
        credentials: true,
      },
    });

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

    return NextResponse.json(success(sanitizedDevice, { message: 'Device created successfully' }), { status: 201 });
  } catch (err) {
    console.error('[API /api/devices POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}