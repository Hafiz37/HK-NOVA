import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { restoreBackup } from '@/lib/backup-restore';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/devices/[id]/restore
 * Restore config from backup (ADMIN only)
 * 
 * Body: { backupId: string, dryRun?: boolean }
 */
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id: deviceId } = await params;
    const body = await request.json();
    const { backupId, dryRun = false } = body;

    if (!backupId) {
      return NextResponse.json({ error: 'backupId required' }, { status: 400 });
    }

    // Check device exists
    const device = await prisma.device.findFirst({
      where: { id: deviceId, deletedAt: null },
      select: { id: true, name: true, ip: true },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Execute restore
    const result = await restoreBackup(prisma, {
      backupId,
      deviceId,
      userId: auth.user.id,
      dryRun,
    });

    // Log restore attempt
    const restoreRecord = await prisma.backupRestore.create({
      data: {
        backupId,
        deviceId,
        restoredBy: auth.user.id,
        status: result.status,
        dryRun,
        preRestoreBackupId: result.preRestoreBackupId,
        command: result.command,
        response: result.response,
        errorMessage: result.errorMessage,
        durationMs: result.durationMs,
      },
    });

    // Audit log
    await logAudit({
      action: dryRun ? 'BACKUP_RESTORE_PREVIEW' : 'BACKUP_RESTORE',
      entity: 'BackupRestore',
      entityId: restoreRecord.id,
      userId: auth.user.id,
      details: {
        deviceId,
        deviceName: device.name,
        backupId,
        status: result.status,
        dryRun,
        preRestoreBackupId: result.preRestoreBackupId,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      data: result,
      message: dryRun
        ? 'Dry-run completed — review commands before executing'
        : result.status === 'SUCCESS'
        ? 'Configuration restored successfully'
        : 'Restore failed',
    });
  } catch (error) {
    console.error('[API /api/devices/[id]/restore] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore backup' },
      { status: 500 }
    );
  }
}