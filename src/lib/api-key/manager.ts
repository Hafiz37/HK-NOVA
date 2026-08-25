import { randomBytes, createHash } from 'crypto';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { getClientIp } from '@/lib/audit';

export interface ApiKeyInfo {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  resourceFilters?: Record<string, any>;
  rateLimit: number;
  allowedIps?: string[];
  isActive: boolean;
  lastUsedAt?: Date;
  usageCount: number;
  expiresAt?: Date;
}

const KEY_PREFIX = 'hkn_';
const KEY_LENGTH = 32;

export async function generateApiKey(
  userId: string,
  name: string,
  scopes: string[],
  options?: {
    resourceFilters?: Record<string, any>;
    rateLimit?: number;
    allowedIps?: string[];
    expiresAt?: Date;
  }
): Promise<{ key: string; keyInfo: ApiKeyInfo }> {
  const randomPart = randomBytes(KEY_LENGTH).toString('hex');
  const key = `${KEY_PREFIX}${randomPart}`;
  const keyPrefix = key.slice(0, 20);
  const keyHash = hashKey(key);

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name,
      keyPrefix,
      keyHash,
      scopes: scopes as any,
      resourceFilters: options?.resourceFilters as any,
      rateLimit: options?.rateLimit ?? 100,
      allowedIps: options?.allowedIps as any,
      expiresAt: options?.expiresAt,
    },
  });

  return {
    key,
    keyInfo: {
      id: apiKey.id,
      userId: apiKey.userId,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes as string[],
      resourceFilters: apiKey.resourceFilters as any,
      rateLimit: apiKey.rateLimit,
      allowedIps: apiKey.allowedIps as string[] | undefined,
      isActive: apiKey.isActive,
      lastUsedAt: apiKey.lastUsedAt ?? undefined,
      usageCount: apiKey.usageCount,
      expiresAt: apiKey.expiresAt ?? undefined,
    },
  };
}

export async function validateApiKey(keyPrefix: string): Promise<ApiKeyInfo | null> {
  if (!keyPrefix.startsWith(KEY_PREFIX)) return null;

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyPrefix },
  });

  if (!apiKey) return null;
  if (!apiKey.isActive) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  return {
    id: apiKey.id,
    userId: apiKey.userId,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes as string[],
    resourceFilters: apiKey.resourceFilters as any,
    rateLimit: apiKey.rateLimit,
    allowedIps: apiKey.allowedIps as string[] | undefined,
    isActive: apiKey.isActive,
    lastUsedAt: apiKey.lastUsedAt ?? undefined,
    usageCount: apiKey.usageCount,
    expiresAt: apiKey.expiresAt ?? undefined,
  };
}

export async function revokeApiKey(keyId: string, reason: string, revokedBy: string): Promise<boolean> {
  const result = await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
      revokedReason: reason,
    },
  });
  return !!result;
}

export async function rotateApiKey(keyId: string): Promise<{ key: string; keyInfo: ApiKeyInfo } | null> {
  const existing = await prisma.apiKey.findUnique({ where: { id: keyId } });
  if (!existing) return null;

  // Revoke old key
  await revokeApiKey(keyId, 'rotated', existing.userId);

  // Generate new key with same settings
  const newKey = await generateApiKey(
    existing.userId,
    existing.name,
    existing.scopes as string[],
    {
      resourceFilters: existing.resourceFilters as any,
      rateLimit: existing.rateLimit,
      allowedIps: existing.allowedIps as string[] | undefined,
      expiresAt: existing.expiresAt ?? undefined,
    }
  );

  return newKey;
}

export function checkKeyScope(apiKey: ApiKeyInfo, requiredScope: string): boolean {
  return apiKey.scopes.includes(requiredScope) || apiKey.scopes.includes('*');
}

export async function checkKeyRateLimit(apiKey: ApiKeyInfo): Promise<boolean> {
  const redis = await import('@/lib/redis-cache').then(m => m.getRedisClient());
  if (!redis) return true; // No Redis, skip rate limit

  try {
    const key = `ratelimit:apikey:${apiKey.id}:minute`;
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, 60);
    }
    return current <= apiKey.rateLimit;
  } catch {
    return true; // Fail open
  }
}

export function checkKeyIpRestriction(apiKey: ApiKeyInfo, ipAddress: string): boolean {
  if (!apiKey.allowedIps || apiKey.allowedIps.length === 0) return true;

  for (const allowed of apiKey.allowedIps) {
    if (matchIp(ipAddress, allowed)) return true;
  }
  return false;
}

function matchIp(ip: string, pattern: string): boolean {
  if (pattern.includes('/')) {
    // CIDR notation
    const [rangeIp, bits] = pattern.split('/');
    return cidrMatch(ip, rangeIp, parseInt(bits, 10));
  }
  return ip === pattern;
}

function cidrMatch(ip: string, rangeIp: string, bits: number): boolean {
  const ipParts = ip.split('.').map(Number);
  const rangeParts = rangeIp.split('.').map(Number);
  const mask = ~((1 << (32 - bits)) - 1);

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];

  return (ipNum & mask) === (rangeNum & mask);
}

export async function trackKeyUsage(
  apiKey: ApiKeyInfo,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTime?: number,
  ipAddress?: string,
  userAgent?: string,
  error?: string
): Promise<void> {
  await prisma.apiKeyUsage.create({
    data: {
      apiKeyId: apiKey.id,
      endpoint,
      method,
      statusCode,
      responseTime,
      ipAddress: ipAddress || 'unknown',
      userAgent,
      error,
    },
  });

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: {
      lastUsedAt: new Date(),
      usageCount: { increment: 1 },
    },
  });
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function verifyKeyHash(key: string, hash: string): boolean {
  return hashKey(key) === hash;
}