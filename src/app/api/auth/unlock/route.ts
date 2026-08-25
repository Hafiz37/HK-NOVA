import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { unlockAccount } from '@/lib/security/account-lockout';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const userId = typeof body.userId === 'string' ? body.userId : '';

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    await unlockAccount(userId, 'admin_action', auth.user.username);

    return NextResponse.json({ message: 'User account unlocked successfully' });
  } catch (error) {
    console.error('[API /api/auth/unlock] Error:', error);
    return NextResponse.json({ error: 'Failed to unlock user account' }, { status: 500 });
  }
}
