import { PrismaClient, ProvisioningAction, ScheduledProvisioningStatus } from '@prisma/client';
import { executeProvisioning } from './provisioning';
import type { ProvisioningFields, ProvisioningActionKey, TemplateName } from './olt-templates';

export interface CreateScheduledInput {
  deviceId: string;
  action: ProvisioningActionKey;
  template?: TemplateName;
  fields: ProvisioningFields;
  scheduledAt: Date;
  createdBy: string;
}

export async function createScheduledProvisioning(
  prisma: PrismaClient,
  input: CreateScheduledInput
) {
  const ACTION_MAP: Record<ProvisioningActionKey, ProvisioningAction> = {
    create_service: 'CREATE',
    suspend_service: 'SUSPEND',
    reactivate_service: 'REACTIVATE',
    terminate_service: 'TERMINATE',
    check_status: 'STATUS_CHECK',
  };

  return await prisma.scheduledProvisioning.create({
    data: {
      deviceId: input.deviceId,
      action: ACTION_MAP[input.action] ?? 'STATUS_CHECK',
      templateName: input.template ?? null,
      fields: JSON.parse(JSON.stringify(input.fields)),
      scheduledAt: input.scheduledAt,
      createdBy: input.createdBy,
      status: 'PENDING',
    },
  });
}

export async function executeDueScheduledProvisioning(prisma: PrismaClient) {
  const now = new Date();
  const dueJobs = await prisma.scheduledProvisioning.findMany({
    where: {
      scheduledAt: { lte: now },
      status: 'PENDING',
    },
    include: { device: true },
  });

  const results = [];

  for (const job of dueJobs) {
    const actionKeyMap: Record<ProvisioningAction, ProvisioningActionKey> = {
      CREATE: 'create_service',
      SUSPEND: 'suspend_service',
      REACTIVATE: 'reactivate_service',
      TERMINATE: 'terminate_service',
      STATUS_CHECK: 'check_status',
    };

    const actionKey = actionKeyMap[job.action] ?? 'check_status';
    const fields = job.fields as ProvisioningFields;

    const result = await executeProvisioning(prisma, {
      deviceId: job.deviceId,
      action: actionKey,
      template: job.templateName as TemplateName ?? undefined,
      fields,
      executedBy: job.createdBy,
      dryRun: false,
    });

    const status: ScheduledProvisioningStatus = result.ok ? 'EXECUTED' : 'FAILED';

    await prisma.scheduledProvisioning.update({
      where: { id: job.id },
      data: {
        status,
        executedAt: new Date(),
        logId: result.log?.id,
      },
    });

    results.push({ job, result });
  }

  return results;
}