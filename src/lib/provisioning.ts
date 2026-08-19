import type { PrismaClient, ProvisioningAction } from '@prisma/client';
import { runSshCommands, resolveSshCredentials } from './device-console';
import {
  OLT_TEMPLATES,
  renderActionCommands,
  resolveTemplate,
  validateActionFields,
  type TemplateName,
  type ProvisioningFields,
  type ProvisioningActionKey,
} from './olt-templates';
import { createAlertIfNotDuplicate, correlationKeyFor } from './alert-engine';
import { DEFAULT_SSH_TIMEOUT } from './constants';

const ACTION_MAP: Record<ProvisioningActionKey, ProvisioningAction> = {
  create_service: 'CREATE',
  suspend_service: 'SUSPEND',
  reactivate_service: 'REACTIVATE',
  terminate_service: 'TERMINATE',
  check_status: 'STATUS_CHECK',
};

export interface ExecuteProvisioningInput {
  deviceId: string;
  action: ProvisioningActionKey | string;
  template?: TemplateName;
  fields: ProvisioningFields;
  executedBy: string;
}

export interface ExecuteProvisioningResult {
  ok: boolean;
  /** Field-validation errors (missing placeholders) when pre-flight fails. */
  fieldErrors?: string[];
  error?: string;
  log?: {
    id: string;
    action: ProvisioningAction;
    status: string;
    command: string;
    response: string | null;
    errorMessage: string | null;
    executedAt: Date;
  };
}

/**
 * Run an OLT/ONT provisioning workflow:
 * resolve template → validate fields → render commands → SSH shell → log.
 */
export async function executeProvisioning(
  prisma: PrismaClient,
  input: ExecuteProvisioningInput
): Promise<ExecuteProvisioningResult> {
  const device = await prisma.device.findFirst({
    where: { id: input.deviceId, deletedAt: null },
    include: { credentials: true },
  });
  if (!device) {
    return { ok: false, error: 'Device not found' };
  }

  const chosen = input.template && OLT_TEMPLATES[input.template];
  const template = chosen ?? resolveTemplate(device.vendor).template;

  if (!template[input.action]) {
    return { ok: false, error: `Action "${input.action}" tidak tersedia di template ini` };
  }

  let rendered: { commands: string[]; description: string };
  try {
    rendered = renderActionCommands(template, input.action, input.fields);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memvalidasi perintah';
    // Pisahkan daftar field yang kurang agar API bisa menjawab 400 + details.
    if (message.startsWith('Field wajib')) {
      return {
        ok: false,
        error: message,
        fieldErrors: validateActionFields(template, input.action, input.fields),
      };
    }
    return { ok: false, error: message };
  }

  const creds = resolveSshCredentials(device.credentials);
  if (!creds) {
    return { ok: false, error: 'SSH credentials tidak dikonfigurasi untuk device ini' };
  }

  const res = await runSshCommands({
    host: device.ip,
    username: creds.username,
    password: creds.password,
    port: creds.port,
    timeoutMs: DEFAULT_SSH_TIMEOUT,
    commands: rendered.commands,
  });

  const actionEnum = ACTION_MAP[input.action as ProvisioningActionKey] ?? 'STATUS_CHECK';
  const responseTail = res.stdout ? res.stdout.slice(-10_000) : null;

  const logRow = await prisma.provisioningLog.create({
    data: {
      deviceId: device.id,
      action: actionEnum,
      ontSerial: input.fields.ontSerial ?? null,
      ponPort: input.fields.ponPort ?? null,
      vlan: input.fields.vlan ?? null,
      serviceProfile: input.fields.serviceProfile ?? null,
      command: rendered.commands.join('\n'),
      response: responseTail,
      status: res.ok ? 'SUCCESS' : 'FAILED',
      errorMessage: res.ok ? null : (res.error ?? 'Provisioning error'),
      executedBy: input.executedBy,
    },
  });

  if (!res.ok) {
    await createAlertIfNotDuplicate(prisma, {
      type: 'PROVISIONING_FAILED',
      deviceId: device.id,
      message: `Provisioning ${input.action} (${actionEnum}) gagal untuk ${device.name} (${device.ip}): ${res.error ?? 'SSH error'}`,
      severity: 'MEDIUM',
      dedupKey: `provision:fail:${device.id}:${input.action}`,
      correlationKey: correlationKeyFor(device.id),
    });

    return {
      ok: false,
      error: res.error ?? 'Provisioning gagal',
      log: {
        id: logRow.id,
        action: actionEnum,
        status: logRow.status,
        command: logRow.command,
        response: logRow.response,
        errorMessage: logRow.errorMessage,
        executedAt: logRow.executedAt,
      },
    };
  }

  return {
    ok: true,
    log: {
      id: logRow.id,
      action: actionEnum,
      status: logRow.status,
      command: logRow.command,
      response: logRow.response,
      errorMessage: logRow.errorMessage,
      executedAt: logRow.executedAt,
    },
  };
}