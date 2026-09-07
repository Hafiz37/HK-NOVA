import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole, CustomerStatus, ServiceType } from '@prisma/client';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { customerActionSchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, NotFoundError, InternalServerError } from '@/lib/api-response';
import { invalidateOnMutation } from '@/lib/query';
import { createMikroTikClient, createCommandBuilder } from '@/lib/mikrotik';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.provision, 'customers:reactivate', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const validatedData = customerActionSchema.parse(body);

    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
      include: {
        device: {
          include: { credentials: true },
        },
      },
    });

    if (!customer) {
      throw new NotFoundError('Customer tidak ditemukan');
    }

    if (customer.status === CustomerStatus.ACTIVE) {
      throw new ValidationError('Customer sudah dalam status active', new Error('Already active'));
    }

    if (customer.status === CustomerStatus.TERMINATED) {
      throw new ValidationError('Customer sudah terminated, tidak bisa di-reactivate', new Error('Already terminated'));
    }

    if (!validatedData.dryRun) {
      try {
        const client = await createMikroTikClient({
          host: customer.device.ip,
          username: customer.device.credentials?.sshUsername || 'admin',
          password: customer.device.credentials?.sshPassword || '',
          port: 8728,
        });

        const builder = createCommandBuilder(client);

        if (customer.serviceType === ServiceType.PPPOE) {
          const result = await builder.reactivatePPPoESecret(customer.username);
          
          if (!result.success) {
            throw new Error(`MikroTik reactivate failed: ${result.error}`);
          }

          await prisma.customerProvisioningLog.create({
            data: {
              customerId: customer.id,
              action: 'REACTIVATE',
              success: true,
              commandSent: 'reactivatePPPoESecret',
              response: JSON.stringify(result.data),
              executedBy: auth.user.id,
            },
          });
        }

        await client.disconnect();

      } catch (mikrotikError) {
        console.error('[MikroTik Reactivate Error]:', mikrotikError);

        await prisma.customerProvisioningLog.create({
          data: {
            customerId: customer.id,
            action: 'REACTIVATE',
            success: false,
            errorMessage: mikrotikError instanceof Error ? mikrotikError.message : String(mikrotikError),
            executedBy: auth.user.id,
          },
        });

        throw new ValidationError(
          'Reactivate ke MikroTik gagal',
          mikrotikError instanceof Error ? mikrotikError : new Error(String(mikrotikError))
        );
      }
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id: params.id },
      data: { status: CustomerStatus.ACTIVE },
    });

    await prisma.customerStatusHistory.create({
      data: {
        customerId: customer.id,
        fromStatus: customer.status,
        toStatus: CustomerStatus.ACTIVE,
        reason: validatedData.reason || 'Reactivated by operator',
        changedBy: auth.user.id,
      },
    });

    await logAudit({
      action: 'UPDATE',
      entity: 'Customer',
      entityId: customer.id,
      userId: auth.user.id,
      details: {
        action: 'REACTIVATE',
        reason: validatedData.reason,
        before: { status: customer.status },
        after: { status: CustomerStatus.ACTIVE },
      },
      ipAddress: clientIp,
    });

    await invalidateOnMutation('customers', customer.id);

    return NextResponse.json(success(updatedCustomer, { message: 'Customer berhasil di-reactivate' }));
  } catch (err) {
    console.error('[API /api/customers/[id]/reactivate POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}
