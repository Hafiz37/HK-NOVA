import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { generateTOTPSecret, hashBackupCodes, verifyTOTPToken } from '@/lib/mfa/totp';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const setup = await generateTOTPSecret(user.username);

    // Save temporary TOTP secret until verified
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: setup.secret,
      },
    });

    return NextResponse.json({
      data: {
        qrCodeUrl: setup.qrCodeUrl,
        secret: setup.secret,
        backupCodes: setup.backupCodes,
      },
      message: 'TOTP secret generated. Verify with /api/auth/mfa/setup (PUT) to enable MFA.',
    });
  } catch (error) {
    console.error('[API /api/auth/mfa/setup POST] Error:', error);
    return NextResponse.json({ error: 'Failed to initiate MFA setup' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const rawBackupCodes = Array.isArray(body.backupCodes) ? body.backupCodes : [];

    if (!token) {
      return NextResponse.json({ error: 'Verification token is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user || !user.totpSecret) {
      return NextResponse.json({ error: 'MFA setup not initiated' }, { status: 400 });
    }

    const valid = verifyTOTPToken(user.totpSecret, token);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid verification token' }, { status: 400 });
    }

    const hashedCodes = await hashBackupCodes(rawBackupCodes);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaMethod: 'totp',
        totpVerifiedAt: new Date(),
        totpBackupCodes: hashedCodes as any,
      },
    });

    return NextResponse.json({ message: 'MFA successfully enabled' });
  } catch (error) {
    console.error('[API /api/auth/mfa/setup PUT] Error:', error);
    return NextResponse.json({ error: 'Failed to verify MFA setup' }, { status: 500 });
  }
}
