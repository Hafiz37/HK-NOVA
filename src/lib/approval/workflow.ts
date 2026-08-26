import { prisma } from '@/lib/prisma';
import type { UserRole } from '@prisma/client';

export interface CreateApprovalRequestInput {
  workflowId: string;
  requestType: string;
  requestData: Record<string, unknown>;
  reason?: string;
  requestedBy: string;
}

export interface ApprovalResponseInput {
  requestId: string;
  approverId: string;
  decision: 'approved' | 'rejected';
  comment?: string;
}

/**
 * Check if approval is required for a given action
 */
export async function checkApprovalRequired(triggerType: string, data: Record<string, unknown>) {
  const workflows = await prisma.approvalWorkflow.findMany({
    where: {
      enabled: true,
      triggerType,
    },
    orderBy: { priority: 'desc' },
  });

  for (const workflow of workflows) {
    if (workflow.conditions) {
      const conditions = workflow.conditions as Record<string, unknown>;
      let match = true;
      for (const [key, value] of Object.entries(conditions)) {
        if (data[key] !== value) {
          match = false;
          break;
        }
      }
      if (match) return workflow;
    } else {
      return workflow;
    }
  }

  return null;
}

/**
 * Create a new approval request
 */
export async function createApprovalRequest(input: CreateApprovalRequestInput) {
  const workflow = await prisma.approvalWorkflow.findUnique({
    where: { id: input.workflowId },
  });

  if (!workflow) {
    throw new Error('Approval workflow not found');
  }

  const requiredApprovals = workflow.requireApprovals || 1;
  let expiresAt: Date | undefined;
  if (workflow.timeoutMinutes) {
    expiresAt = new Date(Date.now() + workflow.timeoutMinutes * 60 * 1000);
  }

  const request = await prisma.approvalRequest.create({
    data: {
      workflowId: input.workflowId,
      requestType: input.requestType,
      requestData: JSON.parse(JSON.stringify(input.requestData)),
      reason: input.reason,
      requestedBy: input.requestedBy,
      requiredApprovals,
      receivedApprovals: 0,
      expiresAt,
    },
  });

  return request;
}

/**
 * Notify approvers about a pending request
 */
export async function notifyApprovers(requestId: string) {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
    include: { workflow: true },
  });

  if (!request) return;

  const workflow = request.workflow;
  const approverRoles = (workflow.approverRoles as UserRole[]) || [];
  const approverUsers = (workflow.approverUsers as string[]) || [];

  let approvers: string[] = [];

  if (approverUsers.length > 0) {
    approvers = approverUsers;
  } else if (approverRoles.length > 0) {
    const users = await prisma.user.findMany({
      where: { role: { in: approverRoles } },
      select: { id: true },
    });
    approvers = users.map(u => u.id);
  }

  // Note: NotificationLog requires subscriptionId, skipping direct notification creation
  // In a full implementation, you would create subscriptions or use a different notification mechanism
}

/**
 * Record an approval/rejection response
 */
export async function respondToApproval(input: ApprovalResponseInput) {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: input.requestId },
    include: { workflow: true, approvals: true },
  });

  if (!request) {
    throw new Error('Approval request not found');
  }

  if (request.status !== 'pending') {
    throw new Error(`Request is already ${request.status}`);
  }

  if (request.expiresAt && request.expiresAt < new Date()) {
    await prisma.approvalRequest.update({
      where: { id: input.requestId },
      data: { status: 'expired' },
    });
    throw new Error('Request has expired');
  }

  // Check if already responded
  const existing = request.approvals.find(a => a.approvedBy === input.approverId);
  if (existing) {
    throw new Error('Already responded to this request');
  }

  const response = await prisma.approvalResponse.create({
    data: {
      requestId: input.requestId,
      approvedBy: input.approverId,
      decision: input.decision,
      comment: input.comment,
    },
  });

  // Check if rejected
  if (input.decision === 'rejected') {
    await prisma.approvalRequest.update({
      where: { id: input.requestId },
      data: {
        status: 'rejected',
        resolvedAt: new Date(),
      },
    });
    return { ...request, status: 'rejected' };
  }

  // Approved - check if threshold met
  const approvedCount = request.approvals.filter(a => a.decision === 'approved').length + 1;

  if (approvedCount >= request.requiredApprovals) {
    // All approvals received - execute
    await prisma.approvalRequest.update({
      where: { id: input.requestId },
      data: {
        status: 'approved',
        resolvedAt: new Date(),
        receivedApprovals: approvedCount,
      },
    });
    return { ...request, status: 'approved', receivedApprovals: approvedCount };
  }

  // Still waiting for more approvals
  await prisma.approvalRequest.update({
    where: { id: input.requestId },
    data: { receivedApprovals: approvedCount },
  });

  return { ...request, status: 'pending', receivedApprovals: approvedCount };
}

/**
 * Execute an approved request (placeholder - implement per request type)
 */
export async function executeApprovedRequest(requestId: string) {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
  });

  if (!request || request.status !== 'approved') {
    throw new Error('Request not approved or not found');
  }

  if (request.executed) {
    throw new Error('Request already executed');
  }

  // This would be extended per request type
  // For now, just mark as executed
  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: {
      executed: true,
      executedAt: new Date(),
      executionResult: JSON.parse(JSON.stringify({ message: 'Executed successfully' })),
    },
  });

  return { success: true };
}

/**
 * Expire timed-out requests (background job)
 */
export async function expirePendingRequests() {
  const expired = await prisma.approvalRequest.findMany({
    where: {
      status: 'pending',
      expiresAt: { lt: new Date() },
    },
  });

  for (const req of expired) {
    await prisma.approvalRequest.update({
      where: { id: req.id },
      data: { status: 'expired', resolvedAt: new Date() },
    });
  }

  return expired.length;
}