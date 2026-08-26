import { NextResponse } from 'next/server';
import { respondToApproval } from '@/lib/approval/workflow';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { approverId, decision, comment } = body;

    if (!approverId || !decision) {
      return NextResponse.json({ ok: false, error: 'approverId and decision required' }, { status: 400 });
    }

    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ ok: false, error: 'Invalid decision' }, { status: 400 });
    }

    if (decision === 'rejected' && !comment) {
      return NextResponse.json({ ok: false, error: 'Comment required for rejection' }, { status: 400 });
    }

    const result = await respondToApproval({ requestId: id, approverId, decision, comment });
    return NextResponse.json({ ok: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}