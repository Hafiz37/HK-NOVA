import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { acknowledgeEvent } from '@/lib/security/timeline';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const success = await acknowledgeEvent(auth.user.id, id);

    if (!success) {
      return NextResponse.json({ error: 'Event not found or already acknowledged' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Acknowledge event error:', error);
    return NextResponse.json({ error: 'Failed to acknowledge event' }, { status: 500 });
  }
}