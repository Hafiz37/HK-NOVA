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
  const rateLimitError = rateLimitResponse(RATE_LIMITS.provision, 'customers:terminate', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
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

    if (customer.status === CustomerStatus.TERMINATED) {
      throw new ValidationError('Customer sudah terminated', new Error('Already terminated'));
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
          const removePPPoEResult = await builder.removePPPoESecret(customer.username);
          
          if (!removePPPoEResult.success) {
            console.warn('[MikroTik] PPPoE removal failed:', removePPPoEResult.error);
          }
        } else if (customer.serviceType === ServiceType.DHCP && customer.ipAddress) {
          const removeDHCPResult = await builder.removeDHCPLease(customer.ipAddress);
          
          if (!removeDHCPResult.success) {
            console.warn('[MikroTik] DHCP removal failed:', removeDHCPResult.error);
          }
        }

        const removeQueueResult = await builder.removeQueue(customer.username);
        
        if (!removeQueueResult.success) {
          console.warn('[MikroTik] Queue removal failed:', removeQueueResult.error);
        }

        await prisma.customerProvisioningLog.create({
          data: {
            customerId: customer.id,
            action: 'TERMINATE',
            success: true,
            commandSent: 'removePPPoESecret + removeQueue',
            response: 'Customer resources removed from MikroTik',
            executedBy: auth.user.id,
          },
        });

        await client.disconnect();

      } catch (mikrotikError) {
        console.error('[MikroTik Terminate Error]:', mikrotikError);

        await prisma.customerProvisioningLog.create({
          data: {
            customerId: customer.id,
            action: 'TERMINATE',
            success: false,
            errorMessage: mikrotikError instanceof Error ? mikrotikError.message : String(mikrotikError),
            executedBy: auth.user.id,
          },
        });

        throw new ValidationError(
          'Terminate ke MikroTik gagal',
          mikrotikError instanceof Error ? mikrotikError : new Error(String(mikrotikError))
        );
      }
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id: params.id },
      data: { 
        status: CustomerStatus.TERMINATED,
        isOnline: false,
      },
    });

    await prisma.customerStatusHistory.create({
      data: {
        customerId: customer.id,
        fromStatus: customer.status,
        toStatus: CustomerStatus.TERMINATED,
        reason: validatedData.reason || 'Terminated by admin',
        changedBy: auth.user.id,
      },
    });

    await logAudit({
      action: 'DELETE',
      entity: 'Customer',
      entityId: customer.id,
      userId: auth.user.id,
      details: {
        action: 'TERMINATE',
        reason: validatedData.reason,
        before: { status: customer.status },
        after: { status: CustomerStatus.TERMINATED },
      },
      ipAddress: clientIp,
    });

    await invalidateOnMutation('customers', customer.id);

    return NextResponse.json(success(updatedCustomer, { message: 'Customer berhasil di-terminate' }));
  } catch (err) {
    console.error('[API /api/customers/[id]/terminate POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}
