import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { verifyTOTPToken } from '@/lib/mfa/totp';

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const password = typeof body.password === 'string' ? body.password : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!password || !code) {
      return NextResponse.json({ error: 'Password and current MFA code are required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user || !user.totpSecret || !user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA is not active for this account' }, { status: 400 });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    const codeMatch = verifyTOTPToken(user.totpSecret, code);
    if (!codeMatch) {
      return NextResponse.json({ error: 'Incorrect MFA code' }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        totpSecret: null,
        totpBackupCodes: Prisma.DbNull,
        totpVerifiedAt: null,
      },
    });

    return NextResponse.json({ message: 'MFA disabled successfully' });
  } catch (error) {
    console.error('[API /api/auth/mfa/disable] Error:', error);
    return NextResponse.json({ error: 'Failed to disable MFA' }, { status: 500 });
  }
}
