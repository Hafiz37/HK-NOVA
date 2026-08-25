import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { createSessionToken, sessionCookieOptions } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { parseDeviceInfo } from '@/lib/auth/device-fingerprint';
import { createRefreshToken, refreshCookieOptions } from '@/lib/auth/token-manager';
import { createOrUpdateUserSession } from '@/lib/auth/session-manager';
import { checkAccountLocked, recordLoginAttempt } from '@/lib/security/account-lockout';
import { createMfaChallenge } from '@/lib/mfa/challenge';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const deviceInfo = await parseDeviceInfo(request);

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

    if (user) {
      const lockStatus = await checkAccountLocked(user.id);
      if (lockStatus.locked) {
        await recordLoginAttempt(username, user.id, false, deviceInfo, 'account_locked');
        return NextResponse.json(
          { error: `Account locked until ${lockStatus.until?.toLocaleTimeString()}. Reason: ${lockStatus.reason}` },
          { status: 423 }
        );
      }
    }

    if (!user) {
      await recordLoginAttempt(username, null, false, deviceInfo, 'invalid_username');
      return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await recordLoginAttempt(username, user.id, false, deviceInfo, 'invalid_password');
      return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 });
    }

    // Record successful authentication step
    await recordLoginAttempt(username, user.id, true, deviceInfo);

    // Check if MFA is required
    if (user.mfaEnabled && user.totpSecret) {
      const sessionToken = await createMfaChallenge(user.id, user.mfaMethod || 'totp', clientIp, deviceInfo.userAgent);

      await logAudit({
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        userId: user.id,
        details: { step: 'mfa_required', mfaMethod: user.mfaMethod },
        ipAddress: clientIp,
      });

      return NextResponse.json({
        data: {
          requireMfa: true,
          sessionToken,
          mfaMethod: user.mfaMethod || 'totp',
        },
        message: 'MFA verification required',
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Create Refresh Token & Session
    const refreshTokenObj = await createRefreshToken(user.id, deviceInfo);
    await createOrUpdateUserSession(user.id, refreshTokenObj.id, deviceInfo);

    const token = createSessionToken(user.username, user.fullName ?? undefined);
    const response = NextResponse.json({
      data: {
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
      message: 'Login berhasil',
    });

    response.cookies.set(sessionCookieOptions(token));
    response.cookies.set(refreshCookieOptions(refreshTokenObj.token));

    await logAudit({
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      details: {
        after: { username: user.username, role: user.role },
        device: deviceInfo.deviceName,
        ip: clientIp,
      },
      ipAddress: clientIp,
    });

    return response;
  } catch (error) {
    console.error('[API /api/auth/login] Error:', error);
    return NextResponse.json({ error: 'Gagal login' }, { status: 500 });
  }
}
