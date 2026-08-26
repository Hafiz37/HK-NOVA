import { NextResponse } from 'next/server';
import { createApprovalRequest, notifyApprovers } from '@/lib/approval/workflow';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const filter = url.searchParams.get('filter');

    const where: Record<string, unknown> = {};

    if (status) where.status = status;

    if (filter === 'my-requests') {
      // TODO: get from auth context
      // where.requestedBy = currentUserId;
    } else if (filter === 'my-approvals') {
      // TODO: join with ApprovalResponse
    }

    const requests = await prisma.approvalRequest.findMany({
      where,
      include: {
        workflow: true,
        requester: { select: { id: true, username: true, email: true, fullName: true } },
        approvals: {
          include: { approver: { select: { id: true, username: true, email: true, fullName: true } } },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return NextResponse.json({ ok: true, requests });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workflowId, requestType, requestData, reason, requestedBy } = body;

    if (!workflowId || !requestType || !requestData || !requestedBy) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
    }

    const request = await createApprovalRequest({ workflowId, requestType, requestData, reason, requestedBy });
    await notifyApprovers(request.id);

    return NextResponse.json({ ok: true, request }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}