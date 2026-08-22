import { PrismaClient, ProvisioningAction } from '@prisma/client';
import { executeProvisioning } from './provisioning';
import { OLT_TEMPLATES, resolveTemplate, type TemplateName, type ProvisioningFields, type ProvisioningActionKey } from './olt-templates';

const ROLLBACK_ACTION_MAP: Record<ProvisioningActionKey, ProvisioningActionKey | null> = {
  create_service: 'terminate_service',
  suspend_service: 'reactivate_service',
  reactivate_service: 'suspend_service',
  terminate_service: null,
  check_status: null,
};

export interface RollbackResult {
  ok: boolean;
  error?: string;
  rollbackLogId?: string;
  originalLogId: string;
}

function extractFieldsFromLog(log: {
  ontSerial: string | null;
  ponPort: string | null;
  vlan: number | null;
  serviceProfile: string | null;
}): ProvisioningFields {
  return {
    ontSerial: log.ontSerial ?? undefined,
    ponPort: log.ponPort ?? undefined,
    vlan: log.vlan ?? undefined,
    serviceProfile: log.serviceProfile ?? undefined,
  };
}

export async function executeRollback(
  prisma: PrismaClient,
  originalLogId: string,
  executedBy: string,
  dryRun: boolean = false,
  reason?: string
): Promise<RollbackResult> {
  const originalLog = await prisma.provisioningLog.findUnique({
    where: { id: originalLogId },
    include: { device: { include: { credentials: true } } },
  });

  if (!originalLog) {
    return { ok: false, error: 'Original provisioning log not found', originalLogId };
  }

  if (originalLog.isRollback === true) {
    return { ok: false, error: 'Cannot rollback a rollback operation', originalLogId };
  }

  const action = originalLog.action;
  const rollbackActionKey = ROLLBACK_ACTION_MAP[action as ProvisioningActionKey];

  if (!rollbackActionKey) {
    return { ok: false, error: `Action "${action}" tidak memiliki rollback otomatis`, originalLogId };
  }

  const device = originalLog.device;
  const templateName = (originalLog.templateName as TemplateName) ?? resolveTemplate(device.vendor).name;
  const template = OLT_TEMPLATES[templateName];

  if (!template[rollbackActionKey]) {
    return { ok: false, error: `Rollback action "${rollbackActionKey}" tidak tersedia di template ${templateName}`, originalLogId };
  }

  const fields = extractFieldsFromLog(originalLog);
  const missingFields: string[] = [];
  const rollbackDef = template[rollbackActionKey];

  for (const command of rollbackDef.commands) {
    const placeholders = command.match(/\{([a-zA-Z0-9]+)\}/g);
    if (placeholders) {
      for (const ph of placeholders) {
        const fieldName = ph.slice(1, -1);
        if (!fields[fieldName as keyof ProvisioningFields]) {
          missingFields.push(fieldName);
        }
      }
    }
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      error: `Field wajib untuk rollback tidak tersedia di log asli: ${[...new Set(missingFields)].join(', ')}`,
      originalLogId,
    };
  }

  const result = await executeProvisioning(prisma, {
    deviceId: device.id,
    action: rollbackActionKey,
    template: templateName,
    fields,
    executedBy,
    dryRun,
    clientIp: originalLog.clientIp ?? undefined,
    userAgent: originalLog.userAgent ?? undefined,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? 'Rollback gagal',
      originalLogId,
    };
  }

  await prisma.provisioningLog.update({
    where: { id: result.log!.id },
    data: {
      isRollback: true,
      rollbackLogId: originalLogId,
      metadata: {
        ...(result.log?.metadata as Record<string, unknown>),
        rollbackReason: reason ?? 'Manual rollback',
        originalAction: action,
        originalLogId,
      },
    },
  });

  await prisma.provisioningLog.update({
    where: { id: originalLogId },
    data: {
      rollbackLogId: result.log!.id,
    },
  });

  return {
    ok: true,
    rollbackLogId: result.log!.id,
    originalLogId,
  };
}

export function canRollback(action: ProvisioningAction): boolean {
  return ROLLBACK_ACTION_MAP[action as ProvisioningActionKey] !== null;
}

export function getRollbackAction(action: ProvisioningAction): ProvisioningActionKey | null {
  return ROLLBACK_ACTION_MAP[action as ProvisioningActionKey];
}