import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 100, 3000);
        },
        lazyConnect: true,
      });

      redisClient.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
      });

      redisClient.on('connect', () => {
        console.log('[Redis] Connected');
      });
    } catch (err) {
      console.error('[Redis] Failed to create client:', err);
      return null;
    }
  }
  return redisClient;
}

export async function connectRedis(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    return client.status === 'ready';
  } catch (err) {
    console.error('[Redis] Connection failed:', err);
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  serialize?: (data: unknown) => string;
  deserialize?: (data: string) => unknown;
}

const defaultSerialize = (data: unknown): string => JSON.stringify(data);
const defaultDeserialize = (data: string): unknown => JSON.parse(data);

const defaultOptions: Required<CacheOptions> = {
  ttl: 60,
  tags: [],
  serialize: defaultSerialize,
  deserialize: defaultDeserialize,
};

const tagPrefix = 'tag:';
const cachePrefix = 'cache:';

function getTagKey(tag: string): string {
  return `${tagPrefix}${tag}`;
}

function getCacheKey(key: string): string {
  return `${cachePrefix}${key}`;
}

export async function cacheGet<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  const deserialize = options.deserialize ?? defaultOptions.deserialize;
  const fullKey = getCacheKey(key);

  try {
    const data = await client.get(fullKey);
    if (!data) return null;
    return deserialize(data) as T;
  } catch (err) {
    console.error(`[Cache] GET error for ${key}:`, err);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, options: CacheOptions = {}): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  const ttl = options.ttl ?? defaultOptions.ttl;
  const serialize = options.serialize ?? defaultOptions.serialize;
  const tags = options.tags ?? defaultOptions.tags;
  const fullKey = getCacheKey(key);

  try {
    const serialized = serialize(value);
    if (ttl > 0) {
      await client.setex(fullKey, ttl, serialized);
    } else {
      await client.set(fullKey, serialized);
    }

    if (tags.length > 0) {
      const pipeline = client.pipeline();
      for (const tag of tags) {
        pipeline.sadd(getTagKey(tag), fullKey);
        pipeline.expire(getTagKey(tag), ttl + 60);
      }
      await pipeline.exec();
    }

    return true;
  } catch (err) {
    console.error(`[Cache] SET error for ${key}:`, err);
    return false;
  }
}

export async function cacheDelete(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  const fullKey = getCacheKey(key);

  try {
    await client.del(fullKey);
    return true;
  } catch (err) {
    console.error(`[Cache] DELETE error for ${key}:`, err);
    return false;
  }
}

export async function cacheInvalidateByTag(tag: string): Promise<number> {
  const client = getRedisClient();
  if (!client) return 0;

  const tagKey = getTagKey(tag);

  try {
    const keys = await client.smembers(tagKey);
    if (keys.length > 0) {
      await client.del(...keys);
    }
    await client.del(tagKey);
    return keys.length;
  } catch (err) {
    console.error(`[Cache] Invalidate by tag error for ${tag}:`, err);
    return 0;
  }
}

export async function cacheInvalidateByPattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  if (!client) return 0;

  try {
    let cursor = '0';
    let totalDeleted = 0;

    do {
      const [newCursor, keys] = await client.scan(cursor, 'MATCH', getCacheKey(pattern), 'COUNT', 100);
      cursor = newCursor;
      if (keys.length > 0) {
        await client.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== '0');

    return totalDeleted;
  } catch (err) {
    console.error(`[Cache] Invalidate by pattern error for ${pattern}:`, err);
    return 0;
  }
}

export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const cached = await cacheGet<T>(key, options);
  if (cached !== null) return cached;

  const fresh = await fetcher();
  await cacheSet(key, fresh, options);
  return fresh;
}

export function createCacheKey(prefix: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params).sort().map(k => `${k}:${params[k]}`).join('|');
  return `${prefix}:${sorted}`;
}

export const CacheTags = {
  DEVICES: 'devices',
  DEVICE: (id: string) => `device:${id}`,
  ALERTS: 'alerts',
  ALERT: (id: string) => `alert:${id}`,
  USERS: 'users',
  USER: (id: string) => `user:${id}`,
  BACKUPS: 'backups',
  BACKUP: (id: string) => `backup:${id}`,
  PROVISIONING: 'provisioning',
  PROVISIONING_LOG: (id: string) => `provisioning:${id}`,
  ANOMALIES: 'anomalies',
  ANOMALY: (id: string) => `anomaly:${id}`,
  SETTINGS: 'settings',
  FEATURE_FLAGS: 'featureFlags',
  MAINTENANCE_WINDOWS: 'maintenanceWindows',
  DASHBOARD_STATS: 'dashboard:stats',
  DEVICE_METRICS: (id: string) => `metrics:device:${id}`,
} as const;