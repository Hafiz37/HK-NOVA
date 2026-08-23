import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Turbopack ignore: filesystem access is intentional for server-side backup storage
const FILESYSTEM_BASE = process.env.BACKUP_FILESYSTEM_PATH || '/var/backups/hk-nova';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

export interface ProcessedBackup {
  content: Buffer;
  isCompressed: boolean;
  isEncrypted: boolean;
  sizeBytes: number;
  compressedBytes: number | null;
  hash: string;
}

export interface BackupContentSource {
  id: string;
  configContent: Buffer | null;
  storageLocation: string;
  filePath: string | null;
  isCompressed: boolean;
  isEncrypted: boolean;
}

/**
 * Compress + Encrypt config content for storage
 * Flow: plaintext -> gzip -> encrypt -> base64
 */
export async function prepareBackupContent(plaintext: string): Promise<ProcessedBackup> {
  const originalSize = Buffer.byteLength(plaintext, 'utf8');
  const hash = createHash('sha256').update(plaintext).digest('hex');

  // Step 1: Compress
  const compressed = await gzipAsync(Buffer.from(plaintext, 'utf8'));

  // Step 2: Encrypt
  if (!ENCRYPTION_KEY) {
    throw new Error('BACKUP_ENCRYPTION_KEY not configured');
  }

  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(compressed),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: [IV(16)][AuthTag(16)][EncryptedData]
  const final = Buffer.concat([iv, authTag, encrypted]);

  return {
    content: final,
    isCompressed: true,
    isEncrypted: true,
    sizeBytes: originalSize,
    compressedBytes: compressed.length,
    hash,
  };
}

/**
 * Decrypt + Decompress config content from storage
 * Flow: base64 -> decrypt -> gunzip -> plaintext
 */
export async function retrieveBackupContent(
  encrypted: Buffer,
  isCompressed: boolean,
  isEncrypted: boolean
): Promise<string> {
  let data = encrypted;

  // Step 1: Decrypt
  if (isEncrypted) {
    if (!ENCRYPTION_KEY) {
      throw new Error('BACKUP_ENCRYPTION_KEY not configured');
    }

    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = data.slice(0, 16);
    const authTag = data.slice(16, 32);
    const encryptedData = data.slice(32);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    data = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);
  }

  // Step 2: Decompress
  if (isCompressed) {
    data = await gunzipAsync(data);
  }

  return data.toString('utf8');
}

/**
 * Generate filesystem path for backup
 * Format: /var/backups/hk-nova/YYYY/MM/device-{deviceId}/backup-{id}.bin
 */
export function getBackupFilePath(backup: { id: string; deviceId: string; timestamp: Date | string }): string {
  const date = backup.timestamp instanceof Date ? backup.timestamp : new Date(backup.timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return path.join(
    /* turbopackIgnore: true */ FILESYSTEM_BASE,
    String(year),
    month,
    `device-${backup.deviceId}`,
    `backup-${backup.id}.bin`
  );
}

/**
 * Save backup content to filesystem
 */
export async function saveToFilesystem(
  backup: { id: string; deviceId: string; timestamp: Date | string },
  content: Buffer
): Promise<string> {
  const filePath = getBackupFilePath(backup);
  const dir = path.dirname(filePath);

  // Create directory structure
  await fs.mkdir(dir, { recursive: true });

  // Write file
  await fs.writeFile(filePath, content);

  // Return relative path (without base)
  return path.relative(FILESYSTEM_BASE, filePath);
}

/**
 * Load backup content from filesystem
 */
export async function loadFromFilesystem(relativePath: string): Promise<Buffer> {
  const fullPath = path.join(/* turbopackIgnore: true */ FILESYSTEM_BASE, relativePath);
  return await fs.readFile(fullPath);
}

/**
 * Archive backup: move from DB to filesystem
 */
export async function archiveBackup(
  backupId: string,
  prisma: Pick<PrismaClient, 'backup'>
): Promise<void> {
  const backup = await prisma.backup.findUnique({
    where: { id: backupId },
    select: {
      id: true,
      deviceId: true,
      timestamp: true,
      configContent: true,
      isCompressed: true,
      isEncrypted: true,
    },
  });

  if (!backup || !backup.configContent) {
    throw new Error('Backup not found or already archived');
  }

  // Save to filesystem
  const relativePath = await saveToFilesystem(backup, backup.configContent as unknown as Buffer);

  // Update DB: clear content, set filePath
  await prisma.backup.update({
    where: { id: backupId },
    data: {
      configContent: null,
      storageLocation: 'filesystem',
      filePath: relativePath,
      archivedAt: new Date(),
    },
  });
}

/**
 * Retrieve backup content (transparent hot/cold tier)
 */
export async function getBackupContent(
  backup: BackupContentSource
): Promise<string> {
  let content: Buffer;

  if (backup.storageLocation === 'filesystem' && backup.filePath) {
    // Load from filesystem
    content = await loadFromFilesystem(backup.filePath);
  } else if (backup.configContent) {
    // Load from database
    content = backup.configContent as unknown as Buffer;
  } else {
    throw new Error('Backup content not available');
  }

  // Decrypt + decompress
  return await retrieveBackupContent(content, backup.isCompressed, backup.isEncrypted);
}

/**
 * Mask sensitive lines in config preview
 */
export function maskSensitiveConfig(config: string): string {
  const lines = config.split('\n');
  const SENSITIVE_PATTERNS = [
    /password/i,
    /community/i,
    /secret/i,
    /key/i,
    /auth.*pass/i,
  ];

  return lines.map((line) => {
    const isSensitive = SENSITIVE_PATTERNS.some((pattern) => pattern.test(line));
    if (isSensitive) {
      const prefix = line.match(/^\s*/)?.[0] || '';
      return `${prefix}[*** MASKED FOR SECURITY ***]`;
    }
    return line;
  }).join('\n');
}