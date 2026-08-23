import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { updateUserSchema, userIdSchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, NotFoundError, ConflictError, InternalServerError } from '@/lib/api-response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.users, 'users:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    userIdSchema.parse({ id });

    const body = await request.json();
    const validatedData = updateUserSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundError('User', id);
    }

    const before = {
      fullName: existingUser.fullName,
      email: existingUser.email,
      role: existingUser.role,
    };

    if (validatedData.role !== undefined && validatedData.role !== existingUser.role) {
      const newRole = validatedData.role as UserRole;
      if (id === auth.user.id && existingUser.role === 'ADMIN' && newRole !== 'ADMIN') {
        throw new ValidationError('Cannot downgrade your own admin role');
      }
      if (existingUser.role === 'ADMIN' && newRole !== 'ADMIN') {
        const otherAdmins = await prisma.user.count({
          where: { role: 'ADMIN', id: { not: id } },
        });
        if (otherAdmins === 0) {
          throw new ValidationError('Cannot remove the last ADMIN role');
        }
      }
    }

    const dataToUpdate: Record<string, unknown> = {};

    if (validatedData.fullName !== undefined) dataToUpdate.fullName = validatedData.fullName ? validatedData.fullName.trim() : null;
    if (validatedData.email !== undefined) {
      if (validatedData.email && validatedData.email.trim() !== existingUser.email) {
        const existingEmail = await prisma.user.findUnique({
          where: { email: validatedData.email.trim() },
        });
        if (existingEmail) {
          throw new ConflictError('Email already in use');
        }
      }
      dataToUpdate.email = validatedData.email ? validatedData.email.trim() : null;
    }
    if (validatedData.role !== undefined) {
      dataToUpdate.role = validatedData.role;
    }
    if (validatedData.password && typeof validatedData.password === 'string' && validatedData.password.length >= 8) {
      dataToUpdate.passwordHash = await bcrypt.hash(validatedData.password, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        updatedAt: true,
      },
    });

    const fieldsChanged: string[] = [];
    if (validatedData.fullName !== undefined && before.fullName !== updatedUser.fullName) fieldsChanged.push('fullName');
    if (validatedData.email !== undefined && before.email !== updatedUser.email) fieldsChanged.push('email');
    if (validatedData.role !== undefined && before.role !== updatedUser.role) fieldsChanged.push('role');
    if (validatedData.password) fieldsChanged.push('password');

    await logAudit({
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      userId: auth.user.id,
      details: {
        before,
        after: {
          fullName: updatedUser.fullName,
          email: updatedUser.email,
          role: updatedUser.role,
          passwordReset: Boolean(validatedData.password),
        },
        fieldsChanged,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(success(updatedUser, { message: 'User updated successfully' }));
  } catch (err) {
    console.error('[API /api/users/[id] PATCH] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.users, 'users:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    userIdSchema.parse({ id });

    if (id === auth.user.id) {
      throw new ValidationError('Cannot delete your own account');
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundError('User', id);
    }

    const before = {
      username: existingUser.username,
      fullName: existingUser.fullName,
      email: existingUser.email,
      role: existingUser.role,
    };

    await prisma.user.delete({
      where: { id },
    });

    await logAudit({
      action: 'DELETE',
      entity: 'User',
      entityId: id,
      userId: auth.user.id,
      details: {
        before,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(success(null, { message: `User ${existingUser.username} deleted successfully` }));
  } catch (err) {
    console.error('[API /api/users/[id] DELETE] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}