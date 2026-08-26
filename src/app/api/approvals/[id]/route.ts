import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const request = await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        workflow: true,
        requester: { select: { id: true, username: true, email: true, fullName: true } },
        approvals: {
          include: { approver: { select: { id: true, username: true, email: true, fullName: true } } },
        },
      },
    });

    if (!request) {
      return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, request });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}