import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

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