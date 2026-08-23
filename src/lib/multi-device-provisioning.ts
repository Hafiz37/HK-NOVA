import { PrismaClient, ProvisioningAction } from '@prisma/client';
import { executeProvisioning, type ExecuteProvisioningResult } from './provisioning';
import type { ProvisioningFields, ProvisioningActionKey, TemplateName } from './olt-templates';

export interface MultiDeviceProvisioningInput {
  deviceIds: string[];
  action: ProvisioningActionKey;
  template?: TemplateName;
  fields: ProvisioningFields;
  executedBy: string;
  dryRun?: boolean;
  continueOnError?: boolean;
  parallelExecution?: boolean;
}

export interface MultiDeviceProvisioningResult {
  ok: boolean;
  totalDevices: number;
  successCount: number;
  failedCount: number;
  deviceResults: Array<{
    deviceId: string;
    deviceName: string;
    deviceIp: string;
    result: ExecuteProvisioningResult;
  }>;
}

export async function executeMultiDeviceProvisioning(
  prisma: PrismaClient,
  input: MultiDeviceProvisioningInput
): Promise<MultiDeviceProvisioningResult> {
  const continueOnError = input.continueOnError ?? true;
  const parallelExecution = input.parallelExecution ?? true;

  const devices = await prisma.device.findMany({
    where: { id: { in: input.deviceIds }, deletedAt: null },
    select: { id: true, name: true, ip: true },
  });

  if (devices.length === 0) {
    return {
      ok: false,
      totalDevices: 0,
      successCount: 0,
      failedCount: 0,
      deviceResults: [],
    };
  }

  const deviceResults: MultiDeviceProvisioningResult['deviceResults'] = [];
  let successCount = 0;
  let failedCount = 0;

  if (parallelExecution) {
    const promises = devices.map(async (device) => {
      const res = await executeProvisioning(prisma, {
        deviceId: device.id,
        action: input.action,
        template: input.template,
        fields: input.fields,
        executedBy: input.executedBy,
        dryRun: input.dryRun,
      });
      return { device, result: res };
    });

    const results = await Promise.all(promises);
    for (const { device, result } of results) {
      deviceResults.push({
        deviceId: device.id,
        deviceName: device.name,
        deviceIp: device.ip,
        result,
      });
      if (result.ok) successCount++;
      else failedCount++;
    }
  } else {
    for (const device of devices) {
      const res = await executeProvisioning(prisma, {
        deviceId: device.id,
        action: input.action,
        template: input.template,
        fields: input.fields,
        executedBy: input.executedBy,
        dryRun: input.dryRun,
      });

      deviceResults.push({
        deviceId: device.id,
        deviceName: device.name,
        deviceIp: device.ip,
        result: res,
      });

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

  return {
    ok: successCount > 0,
    totalDevices: devices.length,
    successCount,
    failedCount,
    deviceResults,
  };
}