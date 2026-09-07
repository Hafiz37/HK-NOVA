import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { updateCustomerSchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, NotFoundError, InternalServerError } from '@/lib/api-response';
import { invalidateOnMutation } from '@/lib/query';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            ip: true,
            type: true,
            vendor: true,
          },
        },
        provisioningLogs: {
          orderBy: { executedAt: 'desc' },
          take: 10,
        },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!customer) {
      throw new NotFoundError('Customer tidak ditemukan');
    }

    return NextResponse.json(success(customer));
  } catch (err) {
    console.error('[API /api/customers/[id] GET] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'customers:update', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validatedData = updateCustomerSchema.parse(body);

    const existingCustomer = await prisma.customer.findUnique({
      where: { id: params.id },
    });

    if (!existingCustomer) {
      throw new NotFoundError('Customer tidak ditemukan');
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id: params.id },
      data: validatedData,
      include: {
        device: true,
      },
    });

    await logAudit({
      action: 'UPDATE',
      entity: 'Customer',
      entityId: updatedCustomer.id,
      userId: auth.user.id,
      details: {
        before: existingCustomer,
        after: updatedCustomer,
      },
      ipAddress: clientIp,
    });

    await invalidateOnMutation('customers', updatedCustomer.id);

    return NextResponse.json(success(updatedCustomer, { message: 'Customer berhasil diupdate' }));
  } catch (err) {
    console.error('[API /api/customers/[id] PATCH] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'customers:delete', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const existingCustomer = await prisma.customer.findUnique({
      where: { id: params.id },
    });

    if (!existingCustomer) {
      throw new NotFoundError('Customer tidak ditemukan');
    }

    await prisma.customer.delete({
      where: { id: params.id },
    });

    await logAudit({
      action: 'DELETE',
      entity: 'Customer',
      entityId: params.id,
      userId: auth.user.id,
      details: {
        before: existingCustomer,
      },
      ipAddress: clientIp,
    });

    await invalidateOnMutation('customers', params.id);

    return NextResponse.json(success({ deleted: true }, { message: 'Customer berhasil dihapus' }));
  } catch (err) {
    console.error('[API /api/customers/[id] DELETE] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}
