import prisma from '@/lib/prisma';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ACKNOWLEDGE'
  | 'RESOLVE'
  | 'EXPORT';

export type AuditEntity =
  | 'User'
  | 'Device'
  | 'Alert'
  | 'Setting'
  | 'MaintenanceWindow'
  | 'Metric'
  | 'AuditLog';

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

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        userId: params.userId,
        details: params.details ? JSON.parse(JSON.stringify(params.details)) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error('[AUDIT] Failed to log audit:', error);
  }
}

export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') ?? undefined;
}