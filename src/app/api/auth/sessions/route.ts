import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getUserSessions, terminateAllOtherSessions } from '@/lib/auth/session-manager';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const sessions = await getUserSessions(auth.user.id);
    return NextResponse.json({ data: sessions });
  } catch (error) {
    console.error('[API /api/auth/sessions GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch active sessions' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const currentSessionId = searchParams.get('currentSessionId') || undefined;

    const count = await terminateAllOtherSessions(auth.user.id, currentSessionId);

    return NextResponse.json({
      message: `Terminated ${count} other active session(s)`,
      count,
    });
  } catch (error) {
    console.error('[API /api/auth/sessions DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to terminate sessions' }, { status: 500 });
  }
}
