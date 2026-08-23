import { NextRequest, NextResponse } from 'next/server';
import { 
  cacheGet, 
  cacheSet, 
  cacheInvalidateByTag, 
  cacheGetOrSet,
  CacheTags, 
  createCacheKey 
} from '@/lib/cache';
import { PaginatedResult } from '@/lib/query-builder';

export { CacheTags, cacheGetOrSet, cacheGet, cacheSet, cacheInvalidateByTag, createCacheKey } from '@/lib/cache';

export interface CacheConfig {
  keyPrefix: string;
  tags: string[];
  ttl?: number;
  varyBy?: (request: NextRequest) => Record<string, unknown>;
  condition?: (request: NextRequest) => boolean;
}

export function withCache<T>(
  config: CacheConfig
) {
  return async function(
    request: NextRequest,
    handler: (request: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    if (config.condition && !config.condition(request)) {
      return handler(request);
    }

    const varyParams = config.varyBy ? config.varyBy(request) : {};
    const cacheKey = createCacheKey(config.keyPrefix, varyParams);

    const cached = await cacheGet<T>(cacheKey, { ttl: config.ttl });
    if (cached) {
      const response = NextResponse.json(cached);
      response.headers.set('X-Cache', 'HIT');
      response.headers.set('X-Cache-Key', cacheKey);
      return response;
    }

    const response = await handler(request);

    if (response.ok) {
      try {
        const data = await response.clone().json();
        await cacheSet(cacheKey, data, { ttl: config.ttl, tags: config.tags });
      } catch {
        // Ignore serialization errors
      }
    }

    response.headers.set('X-Cache', 'MISS');
    response.headers.set('X-Cache-Key', cacheKey);
    return response;
  };
}

export async function invalidateCache(tags: string | string[]): Promise<number> {
  const tagArray = Array.isArray(tags) ? tags : [tags];
  let total = 0;
  for (const tag of tagArray) {
    total += await cacheInvalidateByTag(tag);
  }
  return total;
}

export const cacheMiddleware = {
  devices: {
    list: { keyPrefix: 'devices:list', tags: [CacheTags.DEVICES], ttl: 60 },
    detail: (id: string) => ({ keyPrefix: `devices:${id}`, tags: [CacheTags.DEVICE(id)], ttl: 120 }),
  },
  alerts: {
    list: { keyPrefix: 'alerts:list', tags: [CacheTags.ALERTS], ttl: 30 },
    detail: (id: string) => ({ keyPrefix: `alerts:${id}`, tags: [CacheTags.ALERT(id)], ttl: 60 }),
  },
  users: {
    list: { keyPrefix: 'users:list', tags: [CacheTags.USERS], ttl: 120 },
    detail: (id: string) => ({ keyPrefix: `users:${id}`, tags: [CacheTags.USER(id)], ttl: 300 }),
  },
  backups: {
    list: { keyPrefix: 'backups:list', tags: [CacheTags.BACKUPS], ttl: 60 },
    detail: (id: string) => ({ keyPrefix: `backups:${id}`, tags: [CacheTags.BACKUP(id)], ttl: 120 }),
  },
  provisioning: {
    list: { keyPrefix: 'provisioning:list', tags: [CacheTags.PROVISIONING], ttl: 30 },
    detail: (id: string) => ({ keyPrefix: `provisioning:${id}`, tags: [CacheTags.PROVISIONING_LOG(id)], ttl: 60 }),
  },
  anomalies: {
    list: { keyPrefix: 'anomalies:list', tags: [CacheTags.ANOMALIES], ttl: 60 },
    detail: (id: string) => ({ keyPrefix: `anomalies:${id}`, tags: [CacheTags.ANOMALY(id)], ttl: 120 }),
  },
  settings: {
    list: { keyPrefix: 'settings:list', tags: [CacheTags.SETTINGS], ttl: 300 },
  },
  featureFlags: {
    list: { keyPrefix: 'featureFlags:list', tags: [CacheTags.FEATURE_FLAGS], ttl: 120 },
  },
  maintenanceWindows: {
    list: { keyPrefix: 'maintenanceWindows:list', tags: [CacheTags.MAINTENANCE_WINDOWS], ttl: 60 },
  },
  dashboard: {
    stats: { keyPrefix: 'dashboard:stats', tags: [CacheTags.DASHBOARD_STATS], ttl: 30 },
  },
} as const;

export function getVaryParams(request: NextRequest): Record<string, unknown> {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const userId = request.headers.get('x-user-id') || 'anonymous';
  return { ...params, userId };
}

export async function invalidateOnMutation(entity: keyof typeof cacheMiddleware, id?: string): Promise<void> {
  const tags: string[] = [];
  
  switch (entity) {
    case 'devices':
      tags.push(CacheTags.DEVICES);
      if (id) tags.push(CacheTags.DEVICE(id));
      tags.push(CacheTags.DASHBOARD_STATS);
      break;
    case 'alerts':
      tags.push(CacheTags.ALERTS);
      if (id) tags.push(CacheTags.ALERT(id));
      tags.push(CacheTags.DASHBOARD_STATS);
      break;
    case 'users':
      tags.push(CacheTags.USERS);
      if (id) tags.push(CacheTags.USER(id));
      break;
    case 'backups':
      tags.push(CacheTags.BACKUPS);
      if (id) tags.push(CacheTags.BACKUP(id));
      break;
    case 'provisioning':
      tags.push(CacheTags.PROVISIONING);
      if (id) tags.push(CacheTags.PROVISIONING_LOG(id));
      break;
    case 'anomalies':
      tags.push(CacheTags.ANOMALIES);
      if (id) tags.push(CacheTags.ANOMALY(id));
      tags.push(CacheTags.DASHBOARD_STATS);
      break;
    case 'settings':
      tags.push(CacheTags.SETTINGS);
      break;
    case 'featureFlags':
      tags.push(CacheTags.FEATURE_FLAGS);
      break;
    case 'maintenanceWindows':
      tags.push(CacheTags.MAINTENANCE_WINDOWS);
      break;
  }

  await invalidateCache(tags);
}