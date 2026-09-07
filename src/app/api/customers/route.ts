import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole, ServiceType, CustomerStatus } from '@prisma/client';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { createCustomerSchema, queryCustomerSchema } from '@/lib/schemas';
import { success, paginated, ApiError, ValidationError, ConflictError, InternalServerError } from '@/lib/api-response';
import { cacheGetOrSet, CacheTags, invalidateOnMutation } from '@/lib/query';
import { createMikroTikClient, createCommandBuilder } from '@/lib/mikrotik';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = queryCustomerSchema.parse(Object.fromEntries(searchParams));

    const cacheKey = `customers:list:${JSON.stringify(query)}`;

    const result = await cacheGetOrSet(
      cacheKey,
      async () => {
        const where: any = {};

        if (query.status) where.status = query.status;
        if (query.serviceType) where.serviceType = query.serviceType;
        if (query.deviceId) where.deviceId = query.deviceId;
        if (query.isOnline !== undefined) where.isOnline = query.isOnline;

        if (query.search) {
          where.OR = [
            { username: { contains: query.search } },
            { fullName: { contains: query.search } },
            { phoneNumber: { contains: query.search } },
            { email: { contains: query.search } },
          ];
        }

        return {
          data: await prisma.customer.findMany({
            where,
            include: {
              device: {
                select: {
                  id: true,
                  name: true,
                  ip: true,
                  type: true,
                },
              },
            },
            orderBy: { [query.sortBy]: query.sortOrder },
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          total: await prisma.customer.count({ where }),
        };
      },
      { ttl: 60, tags: [CacheTags.DEVICES] }
    );

    return NextResponse.json(paginated(result.data, query.page, query.limit, result.total));
  } catch (err) {
    console.error('[API /api/customers GET] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.provision, 'customers:create', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validatedData = createCustomerSchema.parse(body);

    const existingCustomer = await prisma.customer.findUnique({
      where: { username: validatedData.username },
    });

    if (existingCustomer) {
      throw new ConflictError('Username sudah digunakan');
    }

    const device = await prisma.device.findUnique({
      where: { id: validatedData.deviceId },
      include: { credentials: true },
    });

    if (!device) {
      throw new ValidationError('Device tidak ditemukan', new Error('Device not found'));
    }

    if (!device.credentials) {
      throw new ValidationError('Device belum memiliki credentials', new Error('Device credentials missing'));
    }

    const newCustomer = await prisma.customer.create({
      data: {
        username: validatedData.username,
        fullName: validatedData.fullName,
        phoneNumber: validatedData.phoneNumber,
        email: validatedData.email,
        address: validatedData.address,
        serviceType: validatedData.serviceType,
        ipAddress: validatedData.ipAddress,
        macAddress: validatedData.macAddress,
        uploadSpeed: validatedData.uploadSpeed,
        downloadSpeed: validatedData.downloadSpeed,
        packageName: validatedData.packageName,
        pppoePassword: validatedData.pppoePassword,
        pppoeProfile: validatedData.pppoeProfile,
        dhcpServer: validatedData.dhcpServer,
        status: CustomerStatus.PENDING,
        activationDate: validatedData.activationDate,
        expiryDate: validatedData.expiryDate,
        billingCycle: validatedData.billingCycle,
        monthlyFee: validatedData.monthlyFee,
        deviceId: validatedData.deviceId,
        createdBy: auth.user.id,
        notes: validatedData.notes,
      },
      include: {
        device: true,
      },
    });

    if (!validatedData.dryRun) {
      try {
        const client = await createMikroTikClient({
          host: device.ip,
          username: device.credentials.sshUsername || 'admin',
          password: device.credentials.sshPassword || '',
          port: 8728,
        });

        const builder = createCommandBuilder(client);

        if (validatedData.serviceType === ServiceType.PPPOE) {
          const pppoeResult = await builder.createPPPoESecret({
            username: validatedData.username,
            password: validatedData.pppoePassword!,
            profile: validatedData.pppoeProfile || 'default',
            comment: `${validatedData.fullName} - ${validatedData.phoneNumber || 'N/A'}`,
          });

          if (!pppoeResult.success) {
            throw new Error(`MikroTik PPPoE creation failed: ${pppoeResult.error}`);
          }

          await prisma.customerProvisioningLog.create({
            data: {
              customerId: newCustomer.id,
              action: 'CREATE',
              success: true,
              commandSent: 'createPPPoESecret',
              response: JSON.stringify(pppoeResult.data),
              executedBy: auth.user.id,
            },
          });
        } else if (validatedData.serviceType === ServiceType.DHCP) {
          const dhcpResult = await builder.createDHCPLease({
            address: validatedData.ipAddress!,
            macAddress: validatedData.macAddress!,
            server: validatedData.dhcpServer || 'dhcp1',
            comment: `${validatedData.fullName} - ${validatedData.phoneNumber || 'N/A'}`,
          });

          if (!dhcpResult.success) {
            throw new Error(`MikroTik DHCP creation failed: ${dhcpResult.error}`);
          }

          await prisma.customerProvisioningLog.create({
            data: {
              customerId: newCustomer.id,
              action: 'CREATE',
              success: true,
              commandSent: 'createDHCPLease',
              response: JSON.stringify(dhcpResult.data),
              executedBy: auth.user.id,
            },
          });
        }

        const queueTarget = validatedData.serviceType === ServiceType.PPPOE 
          ? validatedData.username 
          : `${validatedData.ipAddress}/32`;

        const queueResult = await builder.createQueue({
          name: validatedData.username,
          target: queueTarget,
          maxLimit: `${validatedData.uploadSpeed}k/${validatedData.downloadSpeed}k`,
          comment: validatedData.packageName,
        });

        if (!queueResult.success) {
          throw new Error(`MikroTik Queue creation failed: ${queueResult.error}`);
        }

        await client.disconnect();

        await prisma.customer.update({
          where: { id: newCustomer.id },
          data: { status: CustomerStatus.ACTIVE },
        });

        await prisma.customerStatusHistory.create({
          data: {
            customerId: newCustomer.id,
            fromStatus: CustomerStatus.PENDING,
            toStatus: CustomerStatus.ACTIVE,
            reason: 'Successfully provisioned to MikroTik',
            changedBy: auth.user.id,
          },
        });

      } catch (mikrotikError) {
        console.error('[MikroTik Provisioning Error]:', mikrotikError);

        await prisma.customerProvisioningLog.create({
          data: {
            customerId: newCustomer.id,
            action: 'CREATE',
            success: false,
            errorMessage: mikrotikError instanceof Error ? mikrotikError.message : String(mikrotikError),
            executedBy: auth.user.id,
          },
        });

        throw new ValidationError(
          'Customer dibuat tapi provisioning ke MikroTik gagal. Silakan coba provision manual.',
          mikrotikError instanceof Error ? mikrotikError : new Error(String(mikrotikError))
        );
      }
    }

    await logAudit({
      action: 'CREATE',
      entity: 'Customer',
      entityId: newCustomer.id,
      userId: auth.user.id,
      details: {
        after: {
          username: newCustomer.username,
          fullName: newCustomer.fullName,
          serviceType: newCustomer.serviceType,
          status: newCustomer.status,
        },
      },
      ipAddress: clientIp,
    });

    await invalidateOnMutation('customers', newCustomer.id);

    return NextResponse.json(
      success(newCustomer, { 
        message: validatedData.dryRun 
          ? 'Dry-run success: Customer akan dibuat tanpa provisioning ke MikroTik' 
          : 'Customer berhasil dibuat dan di-provision ke MikroTik' 
      }), 
      { status: 201 }
    );
  } catch (err) {
    console.error('[API /api/customers POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}
