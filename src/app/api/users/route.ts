import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ data: users });
  } catch (error) {
    console.error('[API /api/users GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
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
    const { username, password, fullName, email, role } = body;

    if (!username || typeof username !== 'string' || username.trim() === '') {
      return NextResponse.json({ error: 'Username wajib diisi' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 });
    }

    if (!fullName || typeof fullName !== 'string' || fullName.trim() === '') {
      return NextResponse.json({ error: 'Nama lengkap wajib diisi' }, { status: 400 });
    }

    if (!role || !Object.values(UserRole).includes(role as UserRole)) {
      return NextResponse.json({ error: 'Role tidak valid (ADMIN, OPERATOR, VIEWER)' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username: username.trim() },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Username sudah digunakan' }, { status: 409 });
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: email.trim() },
      });
      if (existingEmail) {
        return NextResponse.json({ error: 'Email sudah digunakan' }, { status: 409 });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        username: username.trim(),
        passwordHash,
        fullName: fullName.trim(),
        email: email?.trim() || null,
        role: role as UserRole,
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

    return NextResponse.json({ data: newUser, message: 'User berhasil dibuat' }, { status: 201 });
  } catch (error) {
    console.error('[API /api/users POST] Error:', error);
    return NextResponse.json({ error: 'Gagal membuat user' }, { status: 500 });
  }
}