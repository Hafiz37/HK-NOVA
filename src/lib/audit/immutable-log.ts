import { createHmac, createHash } from 'crypto';
import prisma from '@/lib/prisma';

function getAuditHmacKey(): string {
  const key = process.env.AUDIT_HMAC_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUDIT_HMAC_KEY environment variable is required in production for audit log integrity');
    }
    console.warn('[SECURITY WARNING] AUDIT_HMAC_KEY is missing. Using development fallback HMAC key.');
    return 'hk-nova-dev-audit-hmac-key-change-in-production';
  }
  return key;
}

const AUDIT_HMAC_KEY = getAuditHmacKey();

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: Date;
  signature?: string | null;
  previousHash?: string | null;
  sequenceNumber: bigint;
  sessionId?: string | null;
  apiKeyId?: string | null;
  dataClassification?: string | null;
  containsPII?: boolean;
  containsSecrets?: boolean;
  retentionPolicy?: string | null;
  retentionUntil?: Date | null;
  isArchived?: boolean;
  archivedAt?: Date | null;
  verified?: boolean;
  verifiedAt?: Date | null;
  tampered?: boolean;
}

export function generateAuditSignature(entry: Omit<AuditLogEntry, 'signature' | 'previousHash'>): string {
  const payload = [
    entry.sequenceNumber.toString(),
    entry.createdAt.toISOString(),
    entry.action,
    entry.entity,
    entry.userId || '',
    JSON.stringify(entry.details || {}),
  ].join('|');

  return createHmac('sha256', AUDIT_HMAC_KEY).update(payload).digest('hex');
}

export function calculateChainHash(currentEntry: AuditLogEntry, previousHash: string | null): string {
  const payload = [
    previousHash || '0'.repeat(64),
    currentEntry.sequenceNumber.toString(),
    currentEntry.createdAt.toISOString(),
    currentEntry.action,
    currentEntry.entity,
    currentEntry.userId || '',
    JSON.stringify(currentEntry.details || {}),
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

export async function verifyAuditLog(entry: AuditLogEntry): Promise<{ valid: boolean; reason?: string }> {
  if (!entry.signature) {
    return { valid: false, reason: 'Missing signature' };
  }

  const expectedSignature = generateAuditSignature(entry);
  if (entry.signature !== expectedSignature) {
    return { valid: false, reason: 'Signature mismatch - data may be tampered' };
  }

  return { valid: true };
}

export async function verifyAuditChain(
  startSeq: number,
  endSeq: number
): Promise<{ valid: boolean; errors: Array<{ sequence: bigint; reason: string }> }> {
  const logs = await prisma.auditLog.findMany({
    where: {
      sequenceNumber: {
        gte: startSeq,
        lte: endSeq,
      },
    },
    orderBy: { sequenceNumber: 'asc' },
  });

  const errors: Array<{ sequence: bigint; reason: string }> = [];
  let previousHash: string | null = null;

  for (const log of logs) {
    const entry: AuditLogEntry = {
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      userId: log.userId,
      details: log.details,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      signature: log.signature || undefined,
      previousHash: log.previousHash || undefined,
      sequenceNumber: log.sequenceNumber,
      sessionId: log.sessionId || undefined,
      apiKeyId: log.apiKeyId || undefined,
      dataClassification: log.dataClassification || undefined,
      containsPII: log.containsPII || false,
      containsSecrets: log.containsSecrets || false,
      retentionPolicy: log.retentionPolicy || undefined,
      retentionUntil: log.retentionUntil || undefined,
      isArchived: log.isArchived || false,
      archivedAt: log.archivedAt || undefined,
      verified: log.verified || false,
      verifiedAt: log.verifiedAt || undefined,
      tampered: log.tampered || false,
    };

    const sigResult = await verifyAuditLog(entry);
    if (!sigResult.valid) {
      errors.push({ sequence: entry.sequenceNumber, reason: sigResult.reason || 'Signature verification failed' });
    }

    const expectedChainHash = calculateChainHash(entry, previousHash);
    if (entry.previousHash && entry.previousHash !== previousHash) {
      errors.push({ sequence: entry.sequenceNumber, reason: 'Chain hash mismatch - previous entry modified' });
    }

    previousHash = expectedChainHash;
  }

  return { valid: errors.length === 0, errors };
}

export async function detectTampering(entry: AuditLogEntry): Promise<{ tampered: boolean; details: string[] }> {
  const details: string[] = [];
  const sigResult = await verifyAuditLog(entry);
  if (!sigResult.valid) {
    details.push(sigResult.reason || 'Invalid signature');
  }

  if (entry.previousHash) {
    const previousEntry = await prisma.auditLog.findFirst({
      where: { sequenceNumber: entry.sequenceNumber - BigInt(1) },
    });
    if (previousEntry) {
      const expectedHash = calculateChainHash({
        ...previousEntry,
        sequenceNumber: previousEntry.sequenceNumber,
        createdAt: previousEntry.createdAt,
        action: previousEntry.action,
        entity: previousEntry.entity,
        userId: previousEntry.userId,
        details: previousEntry.details,
        ipAddress: previousEntry.ipAddress,
      } as AuditLogEntry, null);
      if (entry.previousHash !== expectedHash) {
        details.push('Previous hash does not match computed chain hash');
      }
    }
  }

  return { tampered: details.length > 0, details };
}

export async function sealAuditPeriod(startDate: Date, endDate: Date): Promise<{ sealed: boolean; count: number }> {
  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      verified: false,
    },
    orderBy: { sequenceNumber: 'asc' },
  });

  let previousHash: string | null = null;
  let count = 0;

  for (const log of logs) {
    const entry: AuditLogEntry = {
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      userId: log.userId,
      details: log.details,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      sequenceNumber: log.sequenceNumber,
      sessionId: log.sessionId || undefined,
      apiKeyId: log.apiKeyId || undefined,
      dataClassification: log.dataClassification || undefined,
      containsPII: log.containsPII || false,
      containsSecrets: log.containsSecrets || false,
      retentionPolicy: log.retentionPolicy || undefined,
      retentionUntil: log.retentionUntil || undefined,
      isArchived: log.isArchived || false,
      archivedAt: log.archivedAt || undefined,
      verified: false,
      tampered: false,
    };

    const signature = generateAuditSignature(entry);
    const chainHash = calculateChainHash(entry, previousHash);

    await prisma.auditLog.update({
      where: { id: log.id },
      data: {
        signature,
        previousHash: chainHash,
        verified: true,
        verifiedAt: new Date(),
      },
    });

    previousHash = chainHash;
    count++;
  }

  return { sealed: true, count };
}