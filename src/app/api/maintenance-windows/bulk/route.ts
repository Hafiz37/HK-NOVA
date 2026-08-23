import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireSession, requireRole } from '@/lib/auth';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { getClientIp, logAudit } from '@/lib/audit';
import { createMaintenanceWindowSchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, InternalServerError } from '@/lib/api-response';
import { invalidateOnMutation } from '@/lib/query';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'maintenance:bulk', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const action = body.action;

    if (!action || !['create', 'delete', 'activate', 'deactivate'].includes(action)) {
      throw new ValidationError('Action must be "create", "delete", "activate", or "deactivate"');
    }

    if (action === 'create') {
      const validatedData = createMaintenanceWindowSchema.parse(body);
      const { deviceIds, deviceTypes, ...windowData } = validatedData;

      let targetDevices: string[] = [];

      if (deviceIds && deviceIds.length > 0) {
        targetDevices = deviceIds;
      } else if (deviceTypes && deviceTypes.length > 0) {
        const devices = await prisma.device.findMany({
          where: { type: { in: deviceTypes as any }, deletedAt: null },
          select: { id: true },
        });
        targetDevices = devices.map(d => d.id);
      } else {
        targetDevices = (body.deviceId ? [body.deviceId] : []).filter(Boolean);
      }

      if (targetDevices.length === 0) {
        throw new ValidationError('No target devices specified');
      }

      const results = await Promise.allSettled(
        targetDevices.map(async (deviceId) => {
          return prisma.maintenanceWindow.create({
            data: {
              deviceId,
              name: windowData.name,
              startAt: windowData.startTime,
              endAt: windowData.endTime,
              reason: windowData.description,
              suppressedTypes: windowData.suppressAlerts ? ['ALL'] : [],
              isActive: true,
            },
          });
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const errors = results
        .filter(r => r.status === 'rejected')
        .map(r => (r as PromiseRejectedResult).reason?.message ?? 'Unknown error');

      await logAudit({
        action: 'BULK_CREATE',
        entity: 'MaintenanceWindow',
        entityId: `bulk:${targetDevices.join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'create',
          requested: targetDevices.length,
          successful,
          failed,
          errors,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('maintenanceWindows');

      return NextResponse.json(success(
        { action: 'create', requested: targetDevices.length, successful, failed },
        { message: `${successful} maintenance windows created, ${failed} failed` }
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

      const deleted = await prisma.maintenanceWindow.deleteMany({
        where: { id: { in: ids } },
      });

      await logAudit({
        action: 'BULK_DELETE',
        entity: 'MaintenanceWindow',
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

      await invalidateOnMutation('maintenanceWindows');

      return NextResponse.json(success(
        { action: 'delete', requested: ids.length, deleted: deleted.count },
        { message: `${deleted.count} maintenance window(s) deleted` }
      ));
    }

    if (action === 'activate' || action === 'deactivate') {
      const { ids } = body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new ValidationError('ids array is required');
      }

      const updated = await prisma.maintenanceWindow.updateMany({
        where: { id: { in: ids } },
        data: { isActive: action === 'activate' },
      });

      await logAudit({
        action: action === 'activate' ? 'BULK_ACTIVATE' : 'BULK_DEACTIVATE',
        entity: 'MaintenanceWindow',
        entityId: `bulk:${ids.join(',')}`,
        userId: auth.user.id,
        details: {
          action,
          requested: ids.length,
          updated: updated.count,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('maintenanceWindows');

      return NextResponse.json(success(
        { action, requested: ids.length, updated: updated.count },
        { message: `${updated.count} maintenance window(s) ${action}d` }
      ));
    }

    throw new ValidationError('Invalid action');
  } catch (err) {
    console.error('[API /api/maintenance-windows/bulk POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}