import type { PrismaClient } from '@prisma/client';
import { execSshCommand, resolveSshCredentials } from './device-console';
import { createAlertIfNotDuplicate, correlationKeyFor } from './alert-engine';
import { DEFAULT_SSH_TIMEOUT } from './constants';
import { prepareBackupContent } from './backup-storage';
import { RealtimeEmitter } from './realtime';

const BACKUP_COMMANDS: Record<string, string> = {
  huawei: 'display current-configuration',
  zte: 'show running-config',
  cisco: 'show running-config',
  generic: 'show running-config',
};

export interface BackupResult {
  status: 'SUCCESS' | 'FAILED';
  saved: boolean;
  changed: boolean;
  hash?: string;
  errorMessage?: string | null;
}

/** Pick a vendor-appropriate command to dump the full running configuration. */
export function backupCommandFor(vendor: string | null | undefined): string {
  const v = (vendor ?? '').toLowerCase();
  if (v.includes('huawei')) return BACKUP_COMMANDS.huawei;
  if (v.includes('zte')) return BACKUP_COMMANDS.zte;
  if (v.includes('cisco')) return BACKUP_COMMANDS.cisco;
  return BACKUP_COMMANDS.generic;
}

interface BackupDevice {
  id: string;
  name: string;
  ip: string;
  vendor: string | null;
  credentials?: {
    sshUsername: string | null;
    sshPassword: string | null;
    sshPort: number | null;
  } | null;
}

/**
 * Perform a single config backup for a device. Records are saved only when the
 * configuration actually changed (sha256 snapshot vs the previous one).
 */
export async function performBackup(
  prisma: PrismaClient,
  device: BackupDevice
): Promise<BackupResult> {
  const startTime = Date.now();

  RealtimeEmitter.backupStarted({
    id: 'pending',
    deviceId: device.id,
    deviceName: device.name,
    status: 'IN_PROGRESS',
    triggerType: 'SCHEDULED',
    sizeBytes: 0,
    durationMs: 0,
  });

  const creds = resolveSshCredentials(device.credentials ?? null);
  if (!creds) {
    RealtimeEmitter.backupFailed({
      id: 'pending',
      deviceId: device.id,
      deviceName: device.name,
      status: 'FAILED',
      triggerType: 'SCHEDULED',
      errorMessage: 'SSH credentials tidak dikonfigurasi',
    });
    return { status: 'FAILED', saved: false, changed: false, errorMessage: 'SSH credentials tidak dikonfigurasi' };
  }

  const sshStartTime = Date.now();
  const res = await execSshCommand({
    host: device.ip,
    username: creds.username,
    password: creds.password,
    port: creds.port,
    timeoutMs: DEFAULT_SSH_TIMEOUT,
    command: backupCommandFor(device.vendor),
  });
  const sshConnectMs = Date.now() - sshStartTime;

  if (!res.ok) {
    await createAlertIfNotDuplicate(prisma, {
      type: 'BACKUP_FAILED',
      deviceId: device.id,
      message: `Backup konfigurasi gagal untuk ${device.name} (${device.ip}): ${res.error ?? 'SSH error'}`,
      severity: 'HIGH',
      dedupKey: `backup:fail:${device.id}`,
      correlationKey: correlationKeyFor(device.id),
    });

    RealtimeEmitter.backupFailed({
      id: 'pending',
      deviceId: device.id,
      deviceName: device.name,
      status: 'FAILED',
      triggerType: 'SCHEDULED',
      errorMessage: res.error ?? 'SSH error',
    });

    return { status: 'FAILED', saved: false, changed: false, errorMessage: res.error ?? 'SSH error' };
  }

  const content = `${res.stdout.trim()}\n`;

  // Prepare content (compress + encrypt)
  const prepared = await prepareBackupContent(content);

  const previous = await prisma.backup.findFirst({
    where: { deviceId: device.id },
    orderBy: { timestamp: 'desc' },
    select: { configHash: true, id: true },
  });

  if (previous && previous.configHash === prepared.hash) {
    // Tidak ada perubahan — jangan menumpuk snapshot identik.
    return { status: 'SUCCESS', saved: false, changed: false, hash: prepared.hash };
  }

  const backup = await prisma.backup.create({
    data: {
      deviceId: device.id,
      configHash: prepared.hash,
      configContent: prepared.content,
      isCompressed: prepared.isCompressed,
      isEncrypted: prepared.isEncrypted,
      sizeBytes: prepared.sizeBytes,
      compressedBytes: prepared.compressedBytes,
      changeDetected: true,
      status: 'SUCCESS',
      durationMs: Date.now() - startTime,
      sshConnectMs,
    },
  });

  RealtimeEmitter.backupCompleted({
    id: backup.id,
    deviceId: device.id,
    deviceName: device.name,
    status: 'SUCCESS',
    triggerType: 'SCHEDULED',
    sizeBytes: prepared.sizeBytes,
    durationMs: Date.now() - startTime,
  });

  return { status: 'SUCCESS', saved: true, changed: true, hash: prepared.hash };
}

/** Load device by id (not deleted) and run a backup on demand. */
export async function performDeviceBackup(prisma: PrismaClient, deviceId: string): Promise<BackupResult> {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, deletedAt: null },
    include: { credentials: true },
  });
  if (!device) throw new Error('Device not found');
  return performBackup(prisma, device);
}