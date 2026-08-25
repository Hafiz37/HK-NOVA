import prisma from '@/lib/prisma';
import { createGzip } from 'zlib';
import { createCipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const scryptAsync = promisify(scrypt);

const ARCHIVE_STORAGE_PATH = process.env.AUDIT_ARCHIVE_PATH || '/var/lib/hk-nova/audit-archives';
const ENCRYPTION_KEY = process.env.AUDIT_ARCHIVE_ENCRYPTION_KEY || 'hk-nova-archive-key-32-bytes-long!!';

export interface RetentionPolicy {
  name: string;
  days: number;
  archiveAfterDays: number;
  description: string;
}

export const RETENTION_POLICIES: Record<string, RetentionPolicy> = {
  standard: { name: 'Standard', days: 365, archiveAfterDays: 90, description: '1 year retention, archive after 90 days' },
  extended: { name: 'Extended', days: 2555, archiveAfterDays: 180, description: '7 years retention, archive after 180 days' },
  permanent: { name: 'Permanent', days: -1, archiveAfterDays: 365, description: 'Permanent retention, archive after 1 year' },
};

function getEncryptionKey(password: string): Promise<Buffer> {
  return scryptAsync(password, 'hk-nova-salt', 32) as Promise<Buffer>;
}

async function encryptData(data: Buffer, key: Buffer): Promise<{ encrypted: Buffer; iv: Buffer; authTag: Buffer }> {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted, iv, authTag };
}

async function compressData(data: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const gzip = createGzip();
    const chunks: Buffer[] = [];
    gzip.on('data', (chunk) => chunks.push(chunk));
    gzip.on('end', () => resolve(Buffer.concat(chunks)));
    gzip.on('error', reject);
    gzip.end(data);
  });
}

export async function applyRetentionPolicy(policyName: string): Promise<void> {
  const policy = RETENTION_POLICIES[policyName];
  if (!policy) throw new Error(`Unknown retention policy: ${policyName}`);

  const retentionUntil = policy.days > 0 ? new Date(Date.now() + policy.days * 24 * 60 * 60 * 1000) : null;
  const archiveAfter = new Date(Date.now() - policy.archiveAfterDays * 24 * 60 * 60 * 1000);

  await prisma.auditLog.updateMany({
    where: {
      retentionPolicy: policyName,
      retentionUntil: null,
    },
    data: {
      retentionUntil,
    },
  });
}

export async function archiveOldLogs(olderThan: Date): Promise<{ archived: number; archiveId: string }> {
  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: { lt: olderThan },
      isArchived: false,
    },
    orderBy: { sequenceNumber: 'asc' },
  });

  if (logs.length === 0) {
    return { archived: 0, archiveId: '' };
  }

  const startDate = logs[0].createdAt;
  const endDate = logs[logs.length - 1].createdAt;

  const jsonData = JSON.stringify(logs, null, 2);
  const compressed = await compressData(jsonData);
  const key = await getEncryptionKey(ENCRYPTION_KEY);
  const { encrypted, iv, authTag } = await encryptData(compressed, key);

  const archiveBuffer = Buffer.concat([
    Buffer.from('HKN-AUDIT-ARCHIVE-V1'),
    iv,
    authTag,
    encrypted,
  ]);

  const fileHash = createHash('sha256').update(archiveBuffer).digest('hex');
  const fileName = `audit_archive_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}_${fileHash.slice(0, 8)}.enc`;
  const filePath = join(ARCHIVE_STORAGE_PATH, fileName);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, archiveBuffer);

  await prisma.auditLog.updateMany({
    where: { id: { in: logs.map((l) => l.id) } },
    data: { isArchived: true, archivedAt: new Date() },
  });

  const archive = await prisma.auditLogArchive.create({
    data: {
      startDate,
      endDate,
      filePath,
      fileHash,
      fileSize: archiveBuffer.length,
      compressed: true,
      encrypted: true,
      recordCount: logs.length,
    },
  });

  return { archived: logs.length, archiveId: archive.id };
}

export async function restoreFromArchive(archiveId: string): Promise<any[]> {
  const archive = await prisma.auditLogArchive.findUnique({ where: { id: archiveId } });
  if (!archive) throw new Error('Archive not found');

  const fileData = await readFile(archive.filePath);
  const magic = fileData.slice(0, 22).toString();
  if (magic !== 'HKN-AUDIT-ARCHIVE-V1') throw new Error('Invalid archive format');

  const iv = fileData.slice(22, 38);
  const authTag = fileData.slice(38, 54);
  const encrypted = fileData.slice(54);

  const key = await getEncryptionKey(ENCRYPTION_KEY);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const compressed = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  const { createGunzip } = await import('zlib');
  const gunzip = createGunzip();
  const chunks: Buffer[] = [];
  gunzip.on('data', (chunk) => chunks.push(chunk));
  gunzip.on('end', () => {
    const decompressed = Buffer.concat(chunks).toString('utf-8');
    return JSON.parse(decompressed);
  });
  gunzip.on('error', (err) => { throw err; });
  gunzip.end(compressed);

  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const chunks: Buffer[] = [];
    gunzip.on('data', (chunk) => chunks.push(chunk));
    gunzip.on('end', () => {
      try {
        const decompressed = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(decompressed));
      } catch (err) {
        reject(err);
      }
    });
    gunzip.on('error', reject);
    gunzip.end(compressed);
  });
}

export async function cleanupExpired(): Promise<{ deleted: number }> {
  const now = new Date();
  const result = await prisma.auditLog.deleteMany({
    where: {
      retentionUntil: { lt: now },
      isArchived: true,
    },
  });
  return { deleted: result.count };
}

import { createHash, createDecipheriv } from 'crypto';