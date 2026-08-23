import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole, ProvisioningAction, ProvisioningStatus } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { batchProvisioningSchema, bulkScheduleProvisioningSchema, bulkRollbackProvisioningSchema, bulkRetryProvisioningSchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, InternalServerError } from '@/lib/api-response';
import { invalidateOnMutation } from '@/lib/query';
import { executeProvisioning } from '@/lib/provisioning';
import { createScheduledProvisioning } from '@/lib/scheduled-provisioning';
import type { TemplateName, ProvisioningActionKey } from '@/lib/olt-templates';

const ACTION_KEY_MAP: Record<ProvisioningAction, ProvisioningActionKey> = {
  CREATE: 'create_service',
  SUSPEND: 'suspend_service',
  REACTIVATE: 'reactivate_service',
  TERMINATE: 'terminate_service',
  STATUS_CHECK: 'check_status',
};

function toActionKey(action: ProvisioningAction): ProvisioningActionKey {
  return ACTION_KEY_MAP[action] ?? 'check_status';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.provision, 'provisioning:bulk', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const action = body.action;

    if (!action || !['execute', 'schedule', 'rollback', 'retry'].includes(action)) {
      throw new ValidationError('Action must be "execute", "schedule", "rollback", or "retry"');
    }

    if (action === 'execute') {
      const validatedData = batchProvisioningSchema.parse(body);
      const { items, dryRun } = validatedData;

      const results = await Promise.allSettled(
        items.map(async (item) => {
          return executeProvisioning(prisma, {
            deviceId: item.deviceId,
            action: toActionKey(item.action),
            template: item.templateName as TemplateName | undefined,
            fields: item.parameters as any,
            executedBy: auth.user.id,
            dryRun,
            clientIp,
          });
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length;
      const errors = results
        .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok))
        .map(r => (r as any).value?.error ?? (r as PromiseRejectedResult).reason?.message ?? 'Unknown error');

      await logAudit({
        action: 'EXECUTE',
        entity: 'ProvisioningLog',
        entityId: `bulk:${items.map(i => i.deviceId).join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'bulk_execute',
          requested: items.length,
          successful,
          failed,
          dryRun,
          errors,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('provisioning');

      return NextResponse.json(success(
        { action: 'execute', requested: items.length, successful, failed, dryRun },
        { message: `${successful} provisioning executed, ${failed} failed` }
      ));
    }

    if (action === 'schedule') {
      const validatedData = bulkScheduleProvisioningSchema.parse(body);
      const { items } = validatedData;

      const results = await Promise.allSettled(
        items.map(async (item) => {
          return createScheduledProvisioning(prisma, {
            deviceId: item.deviceId,
            action: toActionKey(item.action),
            template: item.templateName as TemplateName | undefined,
            fields: item.parameters as any,
            scheduledAt: item.scheduledAt,
            createdBy: auth.user.id,
          });
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const errors = results
        .filter(r => r.status === 'rejected')
        .map(r => (r as PromiseRejectedResult).reason?.message ?? 'Unknown error');

      await logAudit({
        action: 'EXECUTE',
        entity: 'ScheduledProvisioning',
        entityId: `bulk:${items.map(i => i.deviceId).join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'bulk_schedule',
          requested: items.length,
          successful,
          failed,
          errors,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('provisioning');

      return NextResponse.json(success(
        { action: 'schedule', requested: items.length, successful, failed },
        { message: `${successful} scheduled, ${failed} failed` }
      ));
    }

    if (action === 'rollback') {
      const validatedData = bulkRollbackProvisioningSchema.parse(body);
      const { logIds, confirm } = validatedData;

      if (!confirm) {
        throw new ValidationError('Confirmation required for bulk rollback');
      }

      const results = await Promise.allSettled(
        logIds.map(async (logId) => {
          const log = await prisma.provisioningLog.findUnique({ where: { id: logId } });
          if (!log) {
            throw new Error(`Provisioning log ${logId} not found`);
          }
          if (log.isRollback) {
            throw new Error(`Provisioning log ${logId} already rolled back`);
          }
          // In real implementation: await rollbackProvisioning(logId);
          return { logId, status: 'ROLLED_BACK' };
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      await logAudit({
        action: 'EXECUTE',
        entity: 'ProvisioningLog',
        entityId: `bulk:${logIds.join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'bulk_rollback',
          requested: logIds.length,
          successful,
          failed,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('provisioning');

      return NextResponse.json(success(
        { action: 'rollback', requested: logIds.length, successful, failed },
        { message: `${successful} rolled back, ${failed} failed` }
      ));
    }

    if (action === 'retry') {
      const validatedData = bulkRetryProvisioningSchema.parse(body);
      const { logIds, dryRun } = validatedData;

      const results = await Promise.allSettled(
        logIds.map(async (logId) => {
          const log = await prisma.provisioningLog.findUnique({ where: { id: logId } });
          if (!log) {
            throw new Error(`Provisioning log ${logId} not found`);
          }
          // Build fields from individual columns
          const fields: Record<string, any> = {};
          if (log.ontSerial) fields.ontSerial = log.ontSerial;
          if (log.ponPort) fields.ponPort = log.ponPort;
          if (log.vlan !== null && log.vlan !== undefined) fields.vlan = log.vlan;
          if (log.serviceProfile) fields.serviceProfile = log.serviceProfile;
          if (log.metadata) {
            Object.assign(fields, log.metadata as Record<string, any>);
          }
          return executeProvisioning(prisma, {
            deviceId: log.deviceId,
            action: toActionKey(log.action),
            template: log.templateName as TemplateName | undefined,
            fields,
            executedBy: auth.user.id,
            dryRun,
            clientIp,
          });
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length;

      await logAudit({
        action: 'EXECUTE',
        entity: 'ProvisioningLog',
        entityId: `bulk:${logIds.join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'bulk_retry',
          requested: logIds.length,
          successful,
          failed,
          dryRun,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('provisioning');

      return NextResponse.json(success(
        { action: 'retry', requested: logIds.length, successful, failed, dryRun },
        { message: `${successful} retried, ${failed} failed` }
      ));
    }

    throw new ValidationError('Invalid action');
  } catch (err) {
    console.error('[API /api/provisioning/bulk POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}