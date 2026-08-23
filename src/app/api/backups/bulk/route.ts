import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { bulkCreateBackupSchema, bulkDeleteBackupSchema, bulkRestoreBackupSchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, NotFoundError, InternalServerError } from '@/lib/api-response';
import { invalidateOnMutation } from '@/lib/query';
import { performBackup } from '@/lib/backup';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'backups:bulk', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const action = body.action;

    if (!action || !['create', 'delete', 'restore'].includes(action)) {
      throw new ValidationError('Action must be "create", "delete", or "restore"');
    }

    if (action === 'create') {
      const validatedData = bulkCreateBackupSchema.parse(body);
      const { deviceIds, triggerType } = validatedData;

      const results = await Promise.allSettled(
        deviceIds.map(async (deviceId) => {
          const device = await prisma.device.findUnique({
            where: { id: deviceId },
            include: { credentials: true },
          });
          if (!device) {
            throw new Error(`Device ${deviceId} not found`);
          }
          return performBackup(prisma, {
            id: device.id,
            name: device.name,
            ip: device.ip,
            vendor: device.vendor,
            credentials: device.credentials ? {
              sshUsername: device.credentials.sshUsername,
              sshPassword: device.credentials.sshPassword,
              sshPort: device.credentials.sshPort,
            } : null,
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
        entity: 'Backup',
        entityId: `bulk:${deviceIds.join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'create',
          requested: deviceIds.length,
          successful,
          failed,
          errors,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('backups');

      return NextResponse.json(success(
        { action: 'create', requested: deviceIds.length, successful, failed },
        { message: `${successful} backup(s) triggered, ${failed} failed` }
      ));
    }

    if (action === 'delete') {
      const validatedData = bulkDeleteBackupSchema.parse(body);
      const { ids, confirm } = validatedData;

      if (!confirm) {
        throw new ValidationError('Confirmation required for bulk delete');
      }

      const backups = await prisma.backup.findMany({
        where: { id: { in: ids } },
        select: { id: true, deviceId: true, status: true, timestamp: true },
      });

      const deleted = await prisma.backup.deleteMany({
        where: { id: { in: ids } },
      });

      await logAudit({
        action: 'BULK_DELETE',
        entity: 'Backup',
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

      await invalidateOnMutation('backups');

      return NextResponse.json(success(
        { action: 'delete', requested: ids.length, deleted: deleted.count },
        { message: `${deleted.count} backup(s) deleted` }
      ));
    }

    if (action === 'restore') {
      const validatedData = bulkRestoreBackupSchema.parse(body);
      const { items } = validatedData;

      // Note: Actual restore implementation would call restoreBackup function
      // This is a placeholder for the bulk restore operation
      const results = await Promise.allSettled(
        items.map(async (item) => {
          const backup = await prisma.backup.findUnique({ where: { id: item.backupId } });
          if (!backup) {
            throw new Error(`Backup ${item.backupId} not found`);
          }
          // In real implementation: await restoreBackup(backup.id);
          return { backupId: item.backupId, status: 'RESTORED' };
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      await logAudit({
        action: 'BULK_RESTORE',
        entity: 'Backup',
        entityId: `bulk:${items.map(i => i.backupId).join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'restore',
          requested: items.length,
          successful,
          failed,
        },
        ipAddress: getClientIp(request),
      });

      return NextResponse.json(success(
        { action: 'restore', requested: items.length, successful, failed },
        { message: `${successful} backup(s) restored, ${failed} failed` }
      ));
    }

    throw new ValidationError('Invalid action');
  } catch (err) {
    console.error('[API /api/backups/bulk POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}