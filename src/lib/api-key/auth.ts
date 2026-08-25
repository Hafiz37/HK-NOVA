import { NextRequest } from 'next/server';
import { validateApiKey, checkKeyScope, checkKeyRateLimit, checkKeyIpRestriction, trackKeyUsage, ApiKeyInfo } from './manager';
import { getClientIp } from '@/lib/audit';

export interface ApiKeyAuthResult {
  ok: boolean;
  user?: { id: string; username: string; role: string };
  apiKey?: ApiKeyInfo;
  error?: string;
}

export async function apiKeyAuth(request: NextRequest): Promise<ApiKeyAuthResult> {
  const apiKeyHeader = request.headers.get('x-api-key') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (!apiKeyHeader) {
    return { ok: false, error: 'Missing API key' };
  }

  if (!apiKeyHeader.startsWith('hkn_')) {
    return { ok: false, error: 'Invalid API key format' };
  }

  const keyPrefix = apiKeyHeader.slice(0, 20);
  const apiKey = await validateApiKey(keyPrefix);

  if (!apiKey) {
    return { ok: false, error: 'Invalid API key' };
  }

  if (!apiKey.isActive) {
    return { ok: false, error: 'API key revoked' };
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { ok: false, error: 'API key expired' };
  }

  const rateLimitOk = await checkKeyRateLimit(apiKey);
  if (!rateLimitOk) {
    return { ok: false, error: 'Rate limit exceeded' };
  }

  const ipAddress = getClientIp(request) || 'unknown';
  const ipOk = checkKeyIpRestriction(apiKey, ipAddress);
  if (!ipOk) {
    return { ok: false, error: 'IP not allowed' };
  }

  // Track usage (async, don't wait)
  trackKeyUsage(
    apiKey,
    request.url,
    request.method,
    200, // Will be updated by caller if needed
    undefined,
    ipAddress,
    request.headers.get('user-agent') || undefined
  ).catch(() => {});

  return {
    ok: true,
    user: { id: apiKey.userId, username: '', role: '' }, // Will be populated by caller
    apiKey,
  };
}

export function requireApiKeyScope(scope: string) {
  return (apiKey: ApiKeyInfo): boolean => checkKeyScope(apiKey, scope);
}