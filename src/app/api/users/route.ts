import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { queryUserSchema, createUserSchema } from '@/lib/schemas';
import { success, paginated, ApiError, ValidationError, ConflictError, InternalServerError } from '@/lib/api-response';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = queryUserSchema.parse(Object.fromEntries(searchParams));

    const where: {
      role?: UserRole;
      OR?: Array<Record<string, unknown>>;
    } = {};

    if (query.role) where.role = query.role;

    if (query.search) {
      where.OR = [
        { username: { contains: query.search } },
        { email: { contains: query.search } },
        { fullName: { contains: query.search } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json(paginated(users, query.page, query.limit, total));
  } catch (err) {
    console.error('[API /api/users GET] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.users, 'users:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validatedData = createUserSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { username: validatedData.username.trim() },
    });

    if (existingUser) {
      throw new ConflictError('Username already in use');
    }

    if (validatedData.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: validatedData.email.trim() },
      });
      if (existingEmail) {
        throw new ConflictError('Email already in use');
      }
    }

    const passwordHash = await bcrypt.hash(validatedData.password, 12);

    const newUser = await prisma.user.create({
      data: {
        username: validatedData.username.trim(),
        passwordHash,
        fullName: validatedData.fullName.trim(),
        email: validatedData.email?.trim() || null,
        role: validatedData.role as UserRole,
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    });

    await logAudit({
      action: 'CREATE',
      entity: 'User',
      entityId: newUser.id,
      userId: auth.user.id,
      details: {
        after: {
          username: newUser.username,
          fullName: newUser.fullName,
          email: newUser.email,
          role: newUser.role,
        },
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(success(newUser, { message: 'User created successfully' }), { status: 201 });
  } catch (err) {
    console.error('[API /api/users POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}