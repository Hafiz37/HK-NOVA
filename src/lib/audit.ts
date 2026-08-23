import prisma from '@/lib/prisma';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ACKNOWLEDGE'
  | 'RESOLVE'
  | 'EXPORT'
  | 'EXECUTE'
  | 'BACKUP'
  | 'BACKUP_VIEW'
  | 'BACKUP_RESTORE'
  | 'BACKUP_RESTORE_PREVIEW'
  | 'ROLLBACK_PREVIEW'
  | 'ROLLBACK_EXECUTE'
  | 'BULK_CREATE'
  | 'BULK_UPDATE'
  | 'BULK_DELETE'
  | 'BULK_ACKNOWLEDGE'
  | 'BULK_RESOLVE'
  | 'BULK_FEEDBACK'
  | 'BULK_INJECT'
  | 'BULK_SCHEDULE'
  | 'BULK_ROLLBACK'
  | 'BULK_RETRY'
  | 'BULK_ENABLE'
  | 'BULK_DISABLE'
  | 'BULK_ACTIVATE'
  | 'BULK_DEACTIVATE'
  | 'BULK_RESTORE';

export type AuditEntity =
  | 'User'
  | 'Device'
  | 'Alert'
  | 'AlertRule'
  | 'Setting'
  | 'MaintenanceWindow'
  | 'Metric'
  | 'AuditLog'
  | 'Backup'
  | 'ProvisioningLog'
  | 'BackupRestore'
  | 'ScheduledProvisioning'
  | 'OltTemplateVersion'
  | 'BatchProvisioning'
  | 'ProvisioningRequest'
  | 'ExportTemplate'
  | 'FeatureFlag'
  | 'Anomaly'
  | 'AnomalyFeedback';

export interface AuditDetails {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  fieldsChanged?: string[];
  [key: string]: unknown;
}

export interface LogAuditParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  userId: string;
  details?: AuditDetails;
  ipAddress?: string;
}

import type { InputJsonValue } from '@prisma/client/runtime/library';

export async function logAudit(params: LogAuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? '',
      userId: params.userId,
      details: (params.details ?? {}) as InputJsonValue,
      ipAddress: params.ipAddress,
    },
  });
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}