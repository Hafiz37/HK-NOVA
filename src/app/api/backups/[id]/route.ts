import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { diffTexts, diffStats } from '@/lib/diff';
import { retrieveBackupContent } from '@/lib/backup-storage';
import { logAudit, getClientIp } from '@/lib/audit';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/backups/[id]
 * Returns one backup snapshot, its full config content, and a diff vs the
 * previous snapshot of the same device (when available).
 */
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    const backup = await prisma.backup.findUnique({
      where: { id },
      include: {
        device: { select: { id: true, name: true, ip: true, type: true, vendor: true } },
      },
    });

    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    // Audit log: track backup access
    await logAudit({
      action: 'BACKUP_VIEW',
      entity: 'Backup',
      entityId: id,
      userId: auth.user.id,
      details: {
        deviceId: backup.deviceId,
        deviceName: backup.device.name,
        timestamp: backup.timestamp,
      },
      ipAddress: getClientIp(request),
    });

    // Retrieve and decrypt/decompress config content
    const configContent = backup.configContent
      ? await retrieveBackupContent(
          backup.configContent as unknown as Buffer,
          backup.isCompressed,
          backup.isEncrypted
        )
      : '';

    const previous = await prisma.backup.findFirst({
      where: { deviceId: backup.deviceId, timestamp: { lt: backup.timestamp } },
      orderBy: { timestamp: 'desc' },
      select: { id: true, configHash: true, timestamp: true, configContent: true, isCompressed: true, isEncrypted: true },
    });

    const prevContent = previous?.configContent
      ? await retrieveBackupContent(
          previous.configContent as unknown as Buffer,
          previous.isCompressed,
          previous.isEncrypted
        )
      : '';

    const diff = previous ? diffTexts(prevContent, configContent) : null;

    return NextResponse.json({
      data: {
        id: backup.id,
        timestamp: backup.timestamp,
        configHash: backup.configHash,
        configContent,
        changeDetected: backup.changeDetected,
        status: backup.status,
        errorMessage: backup.errorMessage,
        isCompressed: backup.isCompressed,
        isEncrypted: backup.isEncrypted,
        sizeBytes: backup.sizeBytes,
        compressedBytes: backup.compressedBytes,
        durationMs: backup.durationMs,
        sshConnectMs: backup.sshConnectMs,
        device: backup.device,
      },
      previous: previous ?? null,
      diff:
        diff
          ? {
              lines: diff,
              stats: diffStats(diff),
            }
          : null,
    });
  } catch (error) {
    console.error('[API /api/backups/[id] GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch backup' }, { status: 500 });
  }
}