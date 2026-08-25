import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { clearSessionCookieOptions, getSession } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import {
  clearRefreshCookieOptions,
  revokeUserRefreshToken,
  REFRESH_COOKIE_NAME,
} from '@/lib/auth/token-manager';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  const userId = session?.username;
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

  if (refreshToken) {
    await revokeUserRefreshToken(refreshToken, 'user_logout');
  }

  const response = NextResponse.json({ message: 'Logout berhasil' });
  response.cookies.set(clearSessionCookieOptions());
  response.cookies.set(clearRefreshCookieOptions());

  if (userId) {
    const user = await prisma.user.findUnique({ where: { username: userId } });
    if (user) {
      await logAudit({
        action: 'LOGOUT',
        entity: 'User',
        entityId: user.id,
        userId: user.id,
        details: {
          after: { username: user.username },
        },
        ipAddress: getClientIp(request),
      });
    }
  }

  return response;
}
