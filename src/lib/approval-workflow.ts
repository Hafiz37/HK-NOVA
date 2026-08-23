import { PrismaClient, ProvisioningAction } from '@prisma/client';
import { executeProvisioning } from './provisioning';
import type { ProvisioningFields, ProvisioningActionKey, TemplateName } from './olt-templates';

export interface CreateRequestInput {
  deviceId: string;
  action: ProvisioningActionKey;
  template?: TemplateName;
  fields: ProvisioningFields;
  requestedBy: string;
}

export async function createProvisioningRequest(
  prisma: PrismaClient,
  input: CreateRequestInput
) {
  const ACTION_MAP: Record<ProvisioningActionKey, ProvisioningAction> = {
    create_service: 'CREATE',
    suspend_service: 'SUSPEND',
    reactivate_service: 'REACTIVATE',
    terminate_service: 'TERMINATE',
    check_status: 'STATUS_CHECK',
  };

  return await prisma.provisioningRequest.create({
    data: {
      deviceId: input.deviceId,
      action: ACTION_MAP[input.action] ?? 'STATUS_CHECK',
      templateName: input.template ?? null,
      fields: JSON.parse(JSON.stringify(input.fields)),
      requestedBy: input.requestedBy,
      status: 'PENDING',
    },
  });
}

export async function reviewProvisioningRequest(
  prisma: PrismaClient,
  requestId: string,
  reviewedBy: string,
  approve: boolean,
  rejectionReason?: string,
  dryRun: boolean = false
) {
  const request = await prisma.provisioningRequest.findUnique({
    where: { id: requestId },
    include: { device: true },
  });

  if (!request) {
    throw new Error('Provisioning request not found');
  }

  if (request.status !== 'PENDING') {
    throw new Error(`Request is already ${request.status.toLowerCase()}`);
  }

  if (!approve) {
    return await prisma.provisioningRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: rejectionReason ?? 'Rejected by supervisor',
      },
    });
  }

  const actionKeyMap: Record<ProvisioningAction, ProvisioningActionKey> = {
    CREATE: 'create_service',
    SUSPEND: 'suspend_service',
    REACTIVATE: 'reactivate_service',
    TERMINATE: 'terminate_service',
    STATUS_CHECK: 'check_status',
  };

  const actionKey = actionKeyMap[request.action] ?? 'check_status';
  const fields = request.fields as ProvisioningFields;

  const result = await executeProvisioning(prisma, {
    deviceId: request.deviceId,
    action: actionKey,
    template: (request.templateName as TemplateName) ?? undefined,
    fields,
    executedBy: request.requestedBy,
    dryRun,
  });

  if (!result.ok) {
    throw new Error(result.error ?? 'Execution failed');
  }

  return await prisma.provisioningRequest.update({
    where: { id: requestId },
    data: {
      status: 'APPROVED',
      reviewedBy,
      reviewedAt: new Date(),
      logId: result.log?.id,
    },
  });
}