import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { terminateSession } from '@/lib/auth/session-manager';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { id: sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const ok = await terminateSession(sessionId, auth.user.id);
    if (!ok) {
      return NextResponse.json({ error: 'Session not found or already terminated' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Session terminated successfully' });
  } catch (error) {
    console.error('[API /api/auth/sessions/[id] DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to terminate session' }, { status: 500 });
  }
}
