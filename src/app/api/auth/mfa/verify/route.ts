import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createSessionToken, sessionCookieOptions } from '@/lib/auth';
import { parseDeviceInfo } from '@/lib/auth/device-fingerprint';
import { createRefreshToken, refreshCookieOptions } from '@/lib/auth/token-manager';
import { createOrUpdateUserSession } from '@/lib/auth/session-manager';
import { verifyTOTPToken, verifyAndConsumeBackupCode } from '@/lib/mfa/totp';
import {
  getMfaChallenge,
  incrementChallengeAttempts,
  markChallengeVerified,
} from '@/lib/mfa/challenge';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const isBackupCode = Boolean(body.isBackupCode);

    if (!sessionToken || !code) {
      return NextResponse.json({ error: 'sessionToken and code are required' }, { status: 400 });
    }

    const challenge = await getMfaChallenge(sessionToken);
    if (!challenge) {
      return NextResponse.json({ error: 'Invalid, expired, or max attempts reached for challenge' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user || !user.mfaEnabled || !user.totpSecret) {
      return NextResponse.json({ error: 'User MFA is not configured' }, { status: 400 });
    }

    let ok = false;

    if (isBackupCode) {
      const backupResult = await verifyAndConsumeBackupCode(user.totpBackupCodes, code);
      if (backupResult.ok) {
        ok = true;
        await prisma.user.update({
          where: { id: user.id },
          data: { totpBackupCodes: backupResult.remainingHashedCodes as Prisma.InputJsonValue },
        });
      }
    } else {
      ok = verifyTOTPToken(user.totpSecret, code);
    }

    if (!ok) {
      const attempts = await incrementChallengeAttempts(sessionToken);
      const remaining = challenge.maxAttempts - attempts;
      return NextResponse.json(
        { error: `Invalid code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Challenge locked.'}` },
        { status: 401 }
      );
    }

    await markChallengeVerified(sessionToken);

    // Complete login sequence
    const deviceInfo = await parseDeviceInfo(request);
    const refreshTokenObj = await createRefreshToken(user.id, deviceInfo);
    await createOrUpdateUserSession(user.id, refreshTokenObj.id, deviceInfo);

    const token = createSessionToken(user.username, user.fullName ?? undefined);

    const response = NextResponse.json({
      data: {
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
      message: 'MFA verification successful. Login complete.',
    });

    response.cookies.set(sessionCookieOptions(token));
    response.cookies.set(refreshCookieOptions(refreshTokenObj.token));

    return response;
  } catch (error) {
    console.error('[API /api/auth/mfa/verify] Error:', error);
    return NextResponse.json({ error: 'Failed to verify MFA code' }, { status: 500 });
  }
}
