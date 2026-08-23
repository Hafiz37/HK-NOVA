import { PrismaClient, ProvisioningAction, BatchStatus } from '@prisma/client';
import { executeProvisioning, type ExecuteProvisioningResult } from './provisioning';
import type { ProvisioningFields, ProvisioningActionKey, TemplateName } from './olt-templates';

export interface BatchProvisioningItem extends ProvisioningFields {
  [key: string]: unknown;
}

export interface ExecuteBatchInput {
  deviceId: string;
  action: ProvisioningActionKey;
  template?: TemplateName;
  items: BatchProvisioningItem[];
  executedBy: string;
  dryRun?: boolean;
  continueOnError?: boolean;
  parallelExecution?: boolean;
  clientIp?: string;
  userAgent?: string;
}

export interface ExecuteBatchResult {
  ok: boolean;
  batchId: string;
  totalItems: number;
  successCount: number;
  failedCount: number;
  status: BatchStatus;
  results: Array<{
    itemIndex: number;
    fields: BatchProvisioningItem;
    result: ExecuteProvisioningResult;
  }>;
}

export async function executeBatchProvisioning(
  prisma: PrismaClient,
  input: ExecuteBatchInput
): Promise<ExecuteBatchResult> {
  const continueOnError = input.continueOnError ?? true;
  const parallelExecution = input.parallelExecution ?? false;

  const ACTION_MAP: Record<ProvisioningActionKey, ProvisioningAction> = {
    create_service: 'CREATE',
    suspend_service: 'SUSPEND',
    reactivate_service: 'REACTIVATE',
    terminate_service: 'TERMINATE',
    check_status: 'STATUS_CHECK',
  };

  const batchRecord = await prisma.batchProvisioning.create({
    data: {
      deviceId: input.deviceId,
      action: ACTION_MAP[input.action] ?? 'STATUS_CHECK',
      templateName: input.template ?? null,
      items: JSON.parse(JSON.stringify(input.items)),
      status: 'RUNNING',
      totalItems: input.items.length,
      continueOnError,
      parallelExecution,
      createdBy: input.executedBy,
      startedAt: new Date(),
    },
  });

  const results: Array<{
    itemIndex: number;
    fields: BatchProvisioningItem;
    result: ExecuteProvisioningResult;
  }> = [];

  let successCount = 0;
  let failedCount = 0;

  if (parallelExecution) {
    const promises = input.items.map(async (item, index) => {
      const res = await executeProvisioning(prisma, {
        deviceId: input.deviceId,
        action: input.action,
        template: input.template,
        fields: item as ProvisioningFields,
        executedBy: input.executedBy,
        dryRun: input.dryRun,
        clientIp: input.clientIp,
        userAgent: input.userAgent,
      });
      return { itemIndex: index, fields: item, result: res };
    });

    const itemResults = await Promise.all(promises);
    for (const itemRes of itemResults) {
      results.push(itemRes);
      if (itemRes.result.ok) successCount++;
      else failedCount++;
    }
  } else {
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      const res = await executeProvisioning(prisma, {
        deviceId: input.deviceId,
        action: input.action,
        template: input.template,
        fields: item as ProvisioningFields,
        executedBy: input.executedBy,
        dryRun: input.dryRun,
        clientIp: input.clientIp,
        userAgent: input.userAgent,
      });

      results.push({ itemIndex: i, fields: item, result: res });

      if (res.ok) {
        successCount++;
      } else {
        failedCount++;
        if (!continueOnError) {
          break;
        }
      }
    }
  }

  let finalStatus: BatchStatus = 'COMPLETED';
  if (failedCount === input.items.length) {
    finalStatus = 'FAILED';
  } else if (failedCount > 0) {
    finalStatus = 'PARTIAL';
  }

  await prisma.batchProvisioning.update({
    where: { id: batchRecord.id },
    data: {
      status: finalStatus,
      successCount,
      failedCount,
      completedAt: new Date(),
    },
  });

  return {
    ok: successCount > 0,
    batchId: batchRecord.id,
    totalItems: input.items.length,
    successCount,
    failedCount,
    status: finalStatus,
    results,
  };
}