/**
 * Redis Distributed Lock Helper
 *
 * Implements atomic distributed locking with auto-expiry and safe release via Lua script.
 * Supports fallback to in-memory lock map if Redis is not configured or unavailable.
 */

import Redis from 'ioredis';
import { randomBytes } from 'crypto';

let redisClient: Redis | null = null;
let redisAvailable = false;
let redisInitialized = false;

function getRedisClient(): Redis | null {
  if (redisInitialized) return redisAvailable ? redisClient : null;
  redisInitialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 5) {
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
    });

    client.on('error', () => {
      redisAvailable = false;
    });

    client.on('close', () => {
      redisAvailable = false;
    });

    void client.connect().catch(() => {
      redisAvailable = false;
    });

    redisClient = client;
    return client;
  } catch {
    return null;
  }
}

// In-memory lock fallback map
const memoryLocks = new Map<string, { token: string; expiresAt: number }>();

const LOCK_PREFIX = 'hk-nova:lock:';

/**
 * Release lock safely with Lua script to ensure owner match
 */
const RELEASE_LUA_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

export interface LockHandle {
  lockKey: string;
  token: string;
  isMemory: boolean;
}

/**
 * Acquire a distributed lock.
 *
 * @param resource  Name of resource/job to lock (e.g., 'worker:icmp:cycle')
 * @param ttlMs     Time-to-live in milliseconds (default 30000ms)
 * @returns LockHandle if acquired, null if lock failed/already held
 */
export async function acquireLock(
  resource: string,
  ttlMs = 30000
): Promise<LockHandle | null> {
  const fullKey = `${LOCK_PREFIX}${resource}`;
  const token = randomBytes(16).toString('hex');
  const client = getRedisClient();

  if (client && redisAvailable) {
    try {
      // SET resource token PX ttlMs NX
      const res = await client.set(fullKey, token, 'PX', ttlMs, 'NX');
      if (res === 'OK') {
        return { lockKey: fullKey, token, isMemory: false };
      }
      return null;
    } catch {
      // Fall through to memory fallback on Redis error
    }
  }

  // Memory fallback
  const existing = memoryLocks.get(fullKey);
  const now = Date.now();
  if (existing && existing.expiresAt > now) {
    return null;
  }

  memoryLocks.set(fullKey, { token, expiresAt: now + ttlMs });
  return { lockKey: fullKey, token, isMemory: true };
}

/**
 * Release a previously acquired distributed lock.
 */
export async function releaseLock(handle: LockHandle | null): Promise<boolean> {
  if (!handle) return false;

  const { lockKey, token, isMemory } = handle;

  if (!isMemory) {
    const client = getRedisClient();
    if (client && redisAvailable) {
      try {
        const result = await client.eval(RELEASE_LUA_SCRIPT, 1, lockKey, token);
        return result === 1;
      } catch {
        // Fall through
      }
    }
  }

  const existing = memoryLocks.get(lockKey);
  if (existing && existing.token === token) {
    memoryLocks.delete(lockKey);
    return true;
  }

  return false;
}

/**
 * Executes an async operation wrapped in a distributed lock.
 * Automatically releases lock on completion or error.
 */
export async function withDistributedLock<T>(
  resource: string,
  fn: () => Promise<T>,
  ttlMs = 30000
): Promise<T | null> {
  const handle = await acquireLock(resource, ttlMs);
  if (!handle) {
    console.info(`[DISTRIBUTED-LOCK] Skipping execution for '${resource}' - lock active on another instance`);
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(handle);
  }
}
