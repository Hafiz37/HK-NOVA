import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole, AlertRuleOperator, AlertRuleDeviceScope, DeviceType } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { success, ApiError, ValidationError, InternalServerError } from '@/lib/api-response';
import { invalidateOnMutation } from '@/lib/query';

const VALID_METRICS = ['cpu', 'mem', 'latency', 'packetLoss', 'jitter', 'customOid'];

import { AlertSeverity } from '@prisma/client';

function parseRuleData(data: unknown): {
  name: string;
  metric: string;
  operator: AlertRuleOperator;
  threshold: number;
  severity: AlertSeverity;
  consecutiveSamples: number;
  deviceScope: AlertRuleDeviceScope;
  deviceType?: DeviceType | null;
  deviceIds?: string[] | null;
  customOidId?: string | null;
  cooldownMs: number;
  enabled: boolean;
} {
  const b = data as Record<string, unknown>;
  return {
    name: b.name as string,
    metric: b.metric as string,
    operator: b.operator as AlertRuleOperator,
    threshold: Number(b.threshold),
    severity: b.severity as AlertSeverity,
    consecutiveSamples: Number(b.consecutiveSamples) || 2,
    deviceScope: (b.deviceScope as AlertRuleDeviceScope) ?? 'ALL',
    deviceType: b.deviceType ? (b.deviceType as DeviceType) : null,
    deviceIds: Array.isArray(b.deviceIds) ? (b.deviceIds as string[]) : null,
    customOidId: (b.customOidId as string) || null,
    cooldownMs: Number(b.cooldownMs) || 300000,
    enabled: b.enabled === undefined ? true : Boolean(b.enabled),
  };
}

function validateRule(b: Record<string, unknown>): string | null {
  if (typeof b.name !== 'string' || !b.name.trim()) return 'name wajib diisi';
  if (typeof b.metric !== 'string' || !VALID_METRICS.includes(b.metric)) return `metric harus salah satu dari: ${VALID_METRICS.join(', ')}`;
  if (!['GT', 'GTE', 'LT', 'LTE'].includes(b.operator as string)) return 'operator harus GT/GTE/LT/LTE';
  if (!Number.isFinite(Number(b.threshold))) return 'threshold harus berupa angka';
  if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(b.severity as string)) return 'severity harus LOW/MEDIUM/HIGH/CRITICAL';
  if (!['ALL', 'DEVICE_TYPE', 'DEVICES'].includes((b.deviceScope as string) ?? 'ALL')) return 'deviceScope harus ALL/DEVICE_TYPE/DEVICES';
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.settings, 'alert-rules:bulk', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const action = body.action;

    if (!action || !['create', 'delete', 'enable', 'disable'].includes(action)) {
      throw new ValidationError('Action must be "create", "delete", "enable", or "disable"');
    }

    if (action === 'create') {
      const rules = body.rules as unknown[];
      if (!Array.isArray(rules) || rules.length === 0) {
        throw new ValidationError('rules array is required');
      }
      if (rules.length > 50) {
        throw new ValidationError('Maximum 50 rules per bulk operation');
      }

      const errors: string[] = [];
      for (const rule of rules) {
        const err = validateRule(rule as Record<string, unknown>);
        if (err) errors.push(err);
      }
      if (errors.length > 0) {
        throw new ValidationError('Validation errors', errors);
      }

      const results = await Promise.allSettled(
        rules.map(async (rule) => {
          const data = parseRuleData(rule);
          return prisma.alertRule.create({
            data: {
              name: data.name,
              metric: data.metric,
              operator: data.operator,
              threshold: data.threshold,
              severity: data.severity,
              consecutiveSamples: data.consecutiveSamples,
              deviceScope: data.deviceScope,
              deviceType: data.deviceType,
              deviceIds: data.deviceIds ?? undefined,
              customOidId: data.customOidId,
              cooldownMs: data.cooldownMs,
              enabled: data.enabled,
            },
          });
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const errs = results
        .filter(r => r.status === 'rejected')
        .map(r => (r as PromiseRejectedResult).reason?.message ?? 'Unknown error');

      await logAudit({
        action: 'BULK_CREATE',
        entity: 'AlertRule',
        entityId: `bulk:${rules.map(r => (r as any).name).join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'create',
          requested: rules.length,
          successful,
          failed,
          errors: errs,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('alerts');

      return NextResponse.json(success(
        { action: 'create', requested: rules.length, successful, failed },
        { message: `${successful} alert rules created, ${failed} failed` }
      ));
    }

    if (action === 'delete') {
      const { ids, confirm } = body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new ValidationError('ids array is required');
      }
      if (!confirm) {
        throw new ValidationError('Confirmation required for bulk delete');
      }

      const deleted = await prisma.alertRule.deleteMany({
        where: { id: { in: ids } },
      });

      await logAudit({
        action: 'BULK_DELETE',
        entity: 'AlertRule',
        entityId: `bulk:${ids.join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'delete',
          requested: ids.length,
          deleted: deleted.count,
          notFound: ids.length - deleted.count,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('alerts');

      return NextResponse.json(success(
        { action: 'delete', requested: ids.length, deleted: deleted.count },
        { message: `${deleted.count} alert rule(s) deleted` }
      ));
    }

    if (action === 'enable' || action === 'disable') {
      const { ids } = body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new ValidationError('ids array is required');
      }

      const updated = await prisma.alertRule.updateMany({
        where: { id: { in: ids } },
        data: { enabled: action === 'enable' },
      });

      await logAudit({
        action: action.toUpperCase(),
        entity: 'AlertRule',
        entityId: `bulk:${ids.join(',')}`,
        userId: auth.user.id,
        details: {
          action,
          requested: ids.length,
          updated: updated.count,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('alerts');

      return NextResponse.json(success(
        { action, requested: ids.length, updated: updated.count },
        { message: `${updated.count} alert rule(s) ${action}d` }
      ));
    }

    throw new ValidationError('Invalid action');
  } catch (err) {
    console.error('[API /api/alert-rules/bulk POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}