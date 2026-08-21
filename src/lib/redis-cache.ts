/**
 * Redis Cache & Pub/Sub Layer
 *
 * Centralized Redis client with:
 *  - TTL-based caching for summary metrics
 *  - Pub/Sub for real-time event broadcasting
 *  - Graceful in-memory fallback when Redis unavailable
 */

import Redis from 'ioredis';

let redisClient: Redis | null = null;
let redisPubSubClient: Redis | null = null;
let redisAvailable = false;
let redisInitialized = false;

interface CacheOptions {
  ttlSeconds?: number;
  tags?: string[];
}

interface PubSubMessage {
  channel: string;
  event: string;
  data: unknown;
  timestamp: string;
}

const CACHE_PREFIX = 'hk-nova:cache:';
const PUBSUB_PREFIX = 'hk-nova:events:';

function getRedisClient(): Redis | null {
  if (redisInitialized) return redisAvailable ? redisClient : null;
  redisInitialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[REDIS-CACHE] REDIS_URL not configured — using in-memory fallback');
    return null;
  }

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 5) {
          console.warn('[REDIS-CACHE] Redis connection failed after retries — falling back to in-memory');
          redisAvailable = false;
          return null;
        }
        return Math.min(times * 500, 3000);
      },
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    client.on('connect', () => {
      redisAvailable = true;
      console.info('[REDIS-CACHE] Redis connected');
    });

    client.on('error', (err: Error) => {
      redisAvailable = false;
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[REDIS-CACHE] Redis error:', err.message);
      }
    });

    client.on('close', () => {
      redisAvailable = false;
    });

    void client.connect().catch(() => {
      redisAvailable = false;
    });

    redisClient = client;
    return client;
  } catch (err) {
    console.warn('[REDIS-CACHE] Failed to init Redis client:', err instanceof Error ? err.message : err);
    return null;
  }
}

function getPubSubClient(): Redis | null {
  const client = getRedisClient();
  if (!client) return null;

  if (!redisPubSubClient) {
    redisPubSubClient = client.duplicate();
  }
  return redisPubSubClient;
}

const memoryCache = new Map<string, { value: unknown; expiry: number }>();
const memorySubscriptions = new Map<string, Set<(data: unknown) => void>>();

function memorySet(key: string, value: unknown, ttlSeconds: number): void {
  const expiry = Date.now() + ttlSeconds * 1000;
  memoryCache.set(key, { value, expiry });
}

function memoryGet(key: string): unknown | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function memoryDelete(key: string): void {
  memoryCache.delete(key);
}

function memoryPublish(channel: string, data: unknown): void {
  const subscribers = memorySubscriptions.get(channel);
  if (subscribers) {
    subscribers.forEach(cb => {
      try { cb(data); } catch { /* ignore */ }
    });
  }
}

function memorySubscribe(channel: string, callback: (data: unknown) => void): () => void {
  const set = memorySubscriptions.get(channel) ?? new Set();
  set.add(callback);
  memorySubscriptions.set(channel, set);
  return () => {
    const s = memorySubscriptions.get(channel);
    if (s) s.delete(callback);
  };
}

export async function cacheSet<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> {
  const ttlSeconds = options.ttlSeconds ?? 300;
  const fullKey = `${CACHE_PREFIX}${key}`;

  const client = getRedisClient();
  if (client && redisAvailable) {
    try {
      await client.setex(fullKey, ttlSeconds, JSON.stringify(value));
      return;
    } catch (err) {
      console.warn('[REDIS-CACHE] Set failed, falling back to memory:', err instanceof Error ? err.message : err);
    }
  }

  memorySet(fullKey, value, ttlSeconds);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const fullKey = `${CACHE_PREFIX}${key}`;

  const client = getRedisClient();
  if (client && redisAvailable) {
    try {
      const data = await client.get(fullKey);
      if (data) return JSON.parse(data) as T;
      return null;
    } catch (err) {
      console.warn('[REDIS-CACHE] Get failed, falling back to memory:', err instanceof Error ? err.message : err);
    }
  }

  return memoryGet(fullKey) as T | null;
}

export async function cacheDelete(key: string): Promise<void> {
  const fullKey = `${CACHE_PREFIX}${key}`;

  const client = getRedisClient();
  if (client && redisAvailable) {
    try {
      await client.del(fullKey);
      return;
    } catch (err) {
      console.warn('[REDIS-CACHE] Delete failed:', err instanceof Error ? err.message : err);
    }
  }

  memoryDelete(fullKey);
}

export async function cacheInvalidateByTag(tag: string): Promise<void> {
  const client = getRedisClient();
  if (client && redisAvailable) {
    try {
      const keys = await client.keys(`${CACHE_PREFIX}*`);
      if (keys.length) {
        const pipeline = client.pipeline();
        keys.forEach(key => pipeline.del(key));
        await pipeline.exec();
      }
      return;
    } catch (err) {
      console.warn('[REDIS-CACHE] Tag invalidation failed:', err instanceof Error ? err.message : err);
    }
  }

  memoryCache.forEach((_, key) => {
    if (key.includes(tag)) memoryCache.delete(key);
  });
}

export async function publishEvent(channel: string, event: string, data: unknown): Promise<void> {
  const fullChannel = `${PUBSUB_PREFIX}${channel}`;
  const message: PubSubMessage = {
    channel: fullChannel,
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  const client = getPubSubClient();
  if (client && redisAvailable) {
    try {
      await client.publish(fullChannel, JSON.stringify(message));
      return;
    } catch (err) {
      console.warn('[REDIS-CACHE] Publish failed, falling back to memory:', err instanceof Error ? err.message : err);
    }
  }

  memoryPublish(fullChannel, message);
}

export async function subscribeToChannel(
  channel: string,
  callback: (event: string, data: unknown) => void
): Promise<() => void> {
  const fullChannel = `${PUBSUB_PREFIX}${channel}`;

  const client = getPubSubClient();
  if (client && redisAvailable) {
    try {
      await client.subscribe(fullChannel);
      const handler = (ch: string, message: string) => {
        if (ch === fullChannel) {
          try {
            const msg = JSON.parse(message) as PubSubMessage;
            callback(msg.event, msg.data);
          } catch {
            callback('message', message);
          }
        }
      };
      client.on('message', handler);
      return () => {
        client.off('message', handler);
        client.unsubscribe(fullChannel).catch(() => {});
      };
    } catch (err) {
      console.warn('[REDIS-CACHE] Subscribe failed, falling back to memory:', err instanceof Error ? err.message : err);
    }
  }

  return memorySubscribe(fullChannel, (msg) => {
    if (msg && typeof msg === 'object' && 'event' in msg && 'data' in msg) {
      callback((msg as PubSubMessage).event, (msg as PubSubMessage).data);
    } else {
      callback('message', msg);
    }
  });
}

export function getCacheStatus(): { backend: 'redis' | 'memory'; connected: boolean; keys: number } {
  const client = getRedisClient();
  if (client && redisAvailable) {
    return { backend: 'redis', connected: true, keys: memoryCache.size };
  }
  return { backend: 'memory', connected: false, keys: memoryCache.size };
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      /* ignore */
    }
    redisClient = null;
  }
  if (redisPubSubClient) {
    try {
      await redisPubSubClient.quit();
    } catch {
      /* ignore */
    }
    redisPubSubClient = null;
  }
  redisAvailable = false;
  redisInitialized = false;
  memoryCache.clear();
  memorySubscriptions.clear();
}