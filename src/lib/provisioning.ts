import type { PrismaClient, ProvisioningAction, ProvisioningStatus, ExecutionMode } from '@prisma/client';
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
import { validateAllTemplates, getValidationSummary } from './template-validator';
import { createAlertIfNotDuplicate, correlationKeyFor } from './alert-engine';
import { DEFAULT_SSH_TIMEOUT } from './constants';

// Validate templates at module load
const templateValidationResults = validateAllTemplates();
const validationSummary = getValidationSummary(templateValidationResults);
if (process.env.NODE_ENV !== 'production') {
  console.log(validationSummary);
}

const hasTemplateErrors = Object.values(templateValidationResults).some((r) => !r.valid);
if (hasTemplateErrors) {
  console.error('⚠️  Template validation failed! Some templates have errors.');
}

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
  dryRun?: boolean;
  clientIp?: string;
  userAgent?: string;
}

export interface ExecuteProvisioningResult {
  ok: boolean;
  /** Field-validation errors (missing placeholders) when pre-flight fails. */
  fieldErrors?: string[];
  error?: string;
  log?: {
    id: string;
    action: ProvisioningAction;
    status: ProvisioningStatus;
    command: string;
    response: string | null;
    errorMessage: string | null;
    executedAt: Date;
    executionMode: ExecutionMode;
    executionTimeMs: number | null;
    metadata?: Record<string, unknown> | null;
  };
}

/**
 * Check if provisioning execution is enabled via feature flag.
 * Returns true if enabled, false if disabled (force dry-run).
 */
async function checkProvisioningEnabled(
  prisma: PrismaClient,
  deviceId: string,
  userId: string
): Promise<boolean> {
  // Check device-specific flag first
  const deviceFlag = await prisma.featureFlag.findFirst({
    where: { key: 'PROVISIONING_EXECUTE_ENABLED', scope: `DEVICE:${deviceId}` },
  });
  if (deviceFlag) return deviceFlag.enabled;

  // Check user-specific flag
  const userFlag = await prisma.featureFlag.findFirst({
    where: { key: 'PROVISIONING_EXECUTE_ENABLED', scope: `USER:${userId}` },
  });
  if (userFlag) return userFlag.enabled;

  // Fallback to global flag
  const globalFlag = await prisma.featureFlag.findUnique({
    where: { key: 'PROVISIONING_EXECUTE_ENABLED', scope: 'GLOBAL' },
  });
  return globalFlag?.enabled ?? false;
}

/**
 * Run an OLT/ONT provisioning workflow:
 * resolve template → validate fields → render commands → SSH shell → log.
 */
export async function executeProvisioning(
  prisma: PrismaClient,
  input: ExecuteProvisioningInput
): Promise<ExecuteProvisioningResult> {
  const startTime = Date.now();
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
    if (message.startsWith('Field wajib')) {
      return {
        ok: false,
        error: message,
        fieldErrors: validateActionFields(template, input.action, input.fields),
      };
    }
    return { ok: false, error: message };
  }

  // Determine execution mode
  const isDryRun = input.dryRun === true;
  const executionMode = isDryRun ? 'DRY_RUN' : 'EXECUTE';

  // Check feature flag if not dry-run
  if (!isDryRun) {
    const canExecute = await checkProvisioningEnabled(prisma, device.id, input.executedBy);
    if (!canExecute) {
      return {
        ok: false,
        error: 'Provisioning execution is disabled by feature flag. Use dry-run mode or contact admin.',
      };
    }
  }

  let res = { ok: true, stdout: '', error: null as string | null };
  let executionTimeMs: number | null = null;

  if (!isDryRun) {
    const creds = resolveSshCredentials(device.credentials);
    if (!creds) {
      return { ok: false, error: 'SSH credentials tidak dikonfigurasi untuk device ini' };
    }

    const sshStartTime = Date.now();
    const sshResult = await runSshCommands({
      host: device.ip,
      username: creds.username,
      password: creds.password,
      port: creds.port,
      timeoutMs: DEFAULT_SSH_TIMEOUT,
      commands: rendered.commands,
    });
    res = { ok: sshResult.ok, stdout: sshResult.stdout, error: sshResult.error ?? null };
    executionTimeMs = Date.now() - sshStartTime;
  } else {
    executionTimeMs = Date.now() - startTime;
  }

  const actionEnum = ACTION_MAP[input.action as ProvisioningActionKey] ?? 'STATUS_CHECK';
  const responseTail = res.stdout ? res.stdout.slice(-10_000) : null;
  const status = isDryRun ? 'DRY_RUN' : (res.ok ? 'SUCCESS' : 'FAILED');

  const templateName = chosen ? input.template : resolveTemplate(device.vendor).name;

  const logRow = await prisma.provisioningLog.create({
    data: {
      deviceId: device.id,
      action: actionEnum,
      ontSerial: input.fields.ontSerial ?? null,
      ponPort: input.fields.ponPort ?? null,
      vlan: input.fields.vlan ?? null,
      serviceProfile: input.fields.serviceProfile ?? null,
      command: rendered.commands.join('\n'),
      response: isDryRun ? '[DRY-RUN MODE] Command tidak dieksekusi ke device' : responseTail,
      status: status as ProvisioningStatus,
      errorMessage: res.ok ? null : (res.error ?? 'Provisioning error'),
      executedBy: input.executedBy,
      templateName,
      templateVersion: '1.0.0', // TODO: versioning in future sprint
      executionMode: executionMode as ExecutionMode,
      executionTimeMs,
      clientIp: input.clientIp ?? null,
      userAgent: input.userAgent ?? null,
      metadata: {
        templateDescription: template[input.action]?.description ?? null,
        fieldsUsed: JSON.parse(JSON.stringify(input.fields)),
      },
    },
  });

  if (!res.ok && !isDryRun) {
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
        executionMode: logRow.executionMode,
        executionTimeMs: logRow.executionTimeMs,
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
      executionMode: logRow.executionMode,
      executionTimeMs: logRow.executionTimeMs,
    },
  };
}