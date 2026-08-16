import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { clearSessionCookieOptions, getSession } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  const userId = session?.username;

  const response = NextResponse.json({ message: 'Logout berhasil' });
  response.cookies.set(clearSessionCookieOptions());

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
