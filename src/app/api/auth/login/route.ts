import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { createSessionToken, sessionCookieOptions } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';

  try {
    const body = await request.json();
    const usernameRaw = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const rateLimitError = rateLimitResponse(
      RATE_LIMITS.login,
      'auth:login',
      clientIp,
      usernameRaw.toLowerCase() || 'unknown'
    );
    if (rateLimitError) return rateLimitError;

    if (!usernameRaw || !password) {
      return NextResponse.json({ error: 'Username dan password wajib diisi' }, { status: 400 });
    }

    const username = usernameRaw;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = createSessionToken(user.username);
    const response = NextResponse.json({
      data: {
        username: user.username,
        fullName: user.fullName,
      },
      message: 'Login berhasil',
    });
    response.cookies.set(sessionCookieOptions(token));

    await logAudit({
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      details: {
        after: { username: user.username, role: user.role },
      },
      ipAddress: getClientIp(request),
    });

    return response;
  } catch (error) {
    console.error('[API /api/auth/login] Error:', error);
    return NextResponse.json({ error: 'Gagal login' }, { status: 500 });
  }
}
