import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createSessionToken, sessionCookieOptions } from '@/lib/auth';
import { parseDeviceInfo } from '@/lib/auth/device-fingerprint';
import {
  verifyAndRotateRefreshToken,
  refreshCookieOptions,
  REFRESH_COOKIE_NAME,
} from '@/lib/auth/token-manager';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token missing' }, { status: 401 });
    }

    const deviceInfo = await parseDeviceInfo(request);
    const rotated = await verifyAndRotateRefreshToken(refreshToken, deviceInfo);

    if (!rotated) {
      return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: rotated.userId },
      select: { username: true, fullName: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const sessionToken = createSessionToken(user.username, user.fullName ?? undefined);
    const response = NextResponse.json({
      data: {
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
      message: 'Token refreshed successfully',
    });

    response.cookies.set(sessionCookieOptions(sessionToken));
    response.cookies.set(refreshCookieOptions(rotated.newToken));

    return response;
  } catch (error) {
    console.error('[API /api/auth/refresh] Error:', error);
    return NextResponse.json({ error: 'Failed to refresh token' }, { status: 500 });
  }
}
