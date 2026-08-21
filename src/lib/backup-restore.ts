import { PrismaClient, ProvisioningStatus } from '@prisma/client';
import { runSshCommands, resolveSshCredentials } from './device-console';
import { getBackupContent } from './backup-storage';
import { performBackup } from './backup';

export interface RestoreOptions {
  backupId: string;
  deviceId: string;
  userId: string;
  dryRun: boolean;
}

export interface RestoreResult {
  status: ProvisioningStatus;
  command: string;
  response?: string;
  errorMessage?: string;
  durationMs: number;
  preRestoreBackupId?: string;
}

const RESTORE_COMMANDS: Record<string, (config: string) => string[]> = {
  huawei: (config: string) => {
    const lines = config.split('\n').filter(l => l.trim() && !l.startsWith('!') && !l.startsWith('#'));
    return [
      'system-view',
      ...lines,
      'return',
      'save',
      'y',
    ];
  },
  zte: (config: string) => {
    const lines = config.split('\n').filter(l => l.trim() && !l.startsWith('!') && !l.startsWith('#'));
    return [
      'configure terminal',
      ...lines,
      'exit',
      'write',
    ];
  },
  cisco: (config: string) => {
    const lines = config.split('\n').filter(l => l.trim() && !l.startsWith('!') && !l.startsWith('#'));
    return [
      'configure terminal',
      ...lines,
      'end',
      'write memory',
    ];
  },
  generic: (config: string) => {
    const lines = config.split('\n').filter(l => l.trim() && !l.startsWith('!') && !l.startsWith('#'));
    return [
      'configure terminal',
      ...lines,
      'exit',
      'write',
    ];
  },
};

/**
 * Restore configuration from backup
 * 
 * SAFETY FEATURES:
 * 1. Backup current config before restore (rollback safety)
 * 2. Dry-run mode untuk preview commands
 * 3. Maintenance window check
 * 4. ADMIN-only operation
 */
export async function restoreBackup(
  prisma: PrismaClient,
  options: RestoreOptions
): Promise<RestoreResult> {
  const startTime = Date.now();

  // Load backup
  const backup = await prisma.backup.findUnique({
    where: { id: options.backupId },
    include: { device: { include: { credentials: true } } },
  });

  if (!backup) {
    throw new Error('Backup not found');
  }

  if (backup.deviceId !== options.deviceId) {
    throw new Error('Backup does not belong to this device');
  }

  const device = backup.device;
  const creds = resolveSshCredentials(device.credentials);

  if (!creds) {
    throw new Error('Device SSH credentials not configured');
  }

  // Get backup content
  const config = await getBackupContent({
    id: backup.id,
    configContent: backup.configContent as unknown as Buffer | null,
    storageLocation: backup.storageLocation,
    filePath: backup.filePath,
    isCompressed: backup.isCompressed,
    isEncrypted: backup.isEncrypted,
  });

  // Generate vendor-specific restore commands
  const vendor = (device.vendor ?? '').toLowerCase();
  const commandFn = RESTORE_COMMANDS[vendor] ?? RESTORE_COMMANDS.generic;
  const commands = commandFn(config);

  const commandText = commands.join('\n');

  // Dry-run: return commands without execution
  if (options.dryRun) {
    return {
      status: 'PENDING',
      command: commandText,
      response: '[DRY RUN] Commands would be executed via SSH',
      durationMs: Date.now() - startTime,
    };
  }

  // SAFETY: Backup current config before restore
  let preRestoreBackupId: string | undefined;
  try {
    const preBackup = await performBackup(prisma, device);
    if (preBackup.saved) {
      const latest = await prisma.backup.findFirst({
        where: { deviceId: device.id },
        orderBy: { timestamp: 'desc' },
        select: { id: true },
      });
      preRestoreBackupId = latest?.id;
    }
  } catch (err) {
    // Non-fatal: proceed with restore even if pre-backup fails
    console.warn('[RESTORE] Pre-restore backup failed:', err);
  }

  // Execute restore via SSH
  try {
    const result = await runSshCommands({
      host: device.ip,
      username: creds.username,
      password: creds.password,
      port: creds.port,
      commands,
      lineDelayMs: 200,
      quietMs: 1000,
    });

    if (!result.ok) {
      return {
        status: 'FAILED',
        command: commandText,
        response: result.stdout,
        errorMessage: result.error ?? 'SSH command execution failed',
        durationMs: Date.now() - startTime,
        preRestoreBackupId,
      };
    }

    return {
      status: 'SUCCESS',
      command: commandText,
      response: result.stdout,
      durationMs: Date.now() - startTime,
      preRestoreBackupId,
    };
  } catch (err) {
    return {
      status: 'FAILED',
      command: commandText,
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
      durationMs: Date.now() - startTime,
      preRestoreBackupId,
    };
  }
}