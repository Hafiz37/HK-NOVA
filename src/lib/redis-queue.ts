/**
 * Redis Queue Adapter
 *
 * Menyediakan antrian (queue) device yang akan di-poll oleh worker ICMP & SNMP.
 * Menggunakan Redis List (RPUSH / BLPOP) untuk atomicity di lingkungan multi-proses.
 *
 * Graceful fallback: jika REDIS_URL tidak dikonfigurasi atau koneksi gagal,
 * adapter otomatis menggunakan in-memory queue agar worker tetap berjalan.
 *
 * Fitur:
 *  - Enqueue batch device sebelum tiap siklus poll.
 *  - Dequeue N items sekaligus (pop banyak) untuk diproses batch berikutnya.
 *  - Key Redis di-scope per worker type (icmp | snmp) agar tidak bentrok.
 *  - TTL otomatis pada key queue (2× polling interval) untuk mencegah stale entries.
 *  - Health check — getStatus() bisa dipakai API route untuk monitoring.
 */

import Redis from 'ioredis';

export type WorkerType = 'icmp' | 'snmp';

export interface QueueStatus {
  backend: 'redis' | 'memory';
  connected: boolean;
  queueLength: number;
  workerType: WorkerType;
}

// ─── Singleton Redis client (lazy-init) ──────────────────────────────────────
let redisClient: Redis | null = null;
let redisAvailable = false;
let redisInitialized = false;

function getRedisClient(): Redis | null {
  if (redisInitialized) return redisAvailable ? redisClient : null;
  redisInitialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[REDIS-QUEUE] REDIS_URL not configured — using in-memory queue fallback');
    return null;
  }

  try {
    const client = new Redis(redisUrl, {
      // Jangan retry selamanya — bila Redis mati, worker tetap berjalan
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 5) {
          console.warn('[REDIS-QUEUE] Redis connection failed after retries — falling back to in-memory queue');
          redisAvailable = false;
          return null; // stop retrying
        }
        return Math.min(times * 500, 3000);
      },
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    client.on('connect', () => {
      redisAvailable = true;
      console.info('[REDIS-QUEUE] Redis connected');
    });

    client.on('error', (err: Error) => {
      redisAvailable = false;
      // Log sekali, tidak setiap reconnect agar tidak spam log
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[REDIS-QUEUE] Redis error:', err.message);
      }
    });

    client.on('close', () => {
      redisAvailable = false;
    });

    // Connect non-blocking
    void client.connect().catch(() => {
      redisAvailable = false;
    });

    redisClient = client;
    return client;
  } catch (err) {
    console.warn('[REDIS-QUEUE] Failed to init Redis client:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── In-memory fallback queue (per WorkerType) ───────────────────────────────
const memoryQueues: Record<WorkerType, string[]> = {
  icmp: [],
  snmp: [],
};

// ─── Queue key helpers ────────────────────────────────────────────────────────
function queueKey(workerType: WorkerType): string {
  return `hk-nova:poll-queue:${workerType}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue device IDs ke antrian.
 * Jika Redis tersedia: RPUSH ke Redis list + set TTL.
 * Fallback: push ke in-memory array (replace seluruh queue).
 *
 * @param workerType  'icmp' | 'snmp'
 * @param deviceIds   Array device IDs yang akan di-enqueue
 * @param ttlSeconds  TTL key Redis (default 2× 5 menit = 600 detik)
 */
export async function enqueueDevices(
  workerType: WorkerType,
  deviceIds: string[],
  ttlSeconds = 600
): Promise<void> {
  if (deviceIds.length === 0) return;

  const client = getRedisClient();
  const key = queueKey(workerType);

  if (client && redisAvailable) {
    try {
      // Hapus queue lama agar tidak menumpuk dari siklus sebelumnya
      await client.del(key);
      if (deviceIds.length > 0) {
        await client.rpush(key, ...deviceIds);
        await client.expire(key, ttlSeconds);
      }
      return;
    } catch (err) {
      console.warn('[REDIS-QUEUE] enqueue failed, falling back to memory:', err instanceof Error ? err.message : err);
      // fall through to memory
    }
  }

  // In-memory fallback: replace queue
  memoryQueues[workerType] = [...deviceIds];
}

/**
 * Dequeue hingga `count` device IDs dari antrian.
 * Jika Redis tersedia: LPOP count items (Redis ≥ 6.2 mendukung LPOP count).
 * Fallback: splice dari memory array.
 *
 * @param workerType  'icmp' | 'snmp'
 * @param count       Jumlah item yang di-dequeue (sesuai batch size)
 * @returns           Array device IDs (kosong jika queue habis)
 */
export async function dequeueDevices(
  workerType: WorkerType,
  count: number
): Promise<string[]> {
  const client = getRedisClient();
  const key = queueKey(workerType);

  if (client && redisAvailable) {
    try {
      // LPOP key count — Redis ≥ 6.2
      const items = await client.lpop(key, count);
      if (Array.isArray(items)) return items;
      if (typeof items === 'string') return [items];
      return [];
    } catch (err) {
      console.warn('[REDIS-QUEUE] dequeue failed, falling back to memory:', err instanceof Error ? err.message : err);
      // fall through to memory
    }
  }

  // In-memory fallback
  return memoryQueues[workerType].splice(0, count);
}

/**
 * Panjang antrian saat ini.
 */
export async function getQueueLength(workerType: WorkerType): Promise<number> {
  const client = getRedisClient();
  const key = queueKey(workerType);

  if (client && redisAvailable) {
    try {
      return await client.llen(key);
    } catch {
      // fall through
    }
  }

  return memoryQueues[workerType].length;
}

/**
 * Status queue — digunakan oleh health API.
 */
export async function getQueueStatus(workerType: WorkerType): Promise<QueueStatus> {
  const queueLength = await getQueueLength(workerType);
  const client = getRedisClient();
  return {
    backend: client && redisAvailable ? 'redis' : 'memory',
    connected: redisAvailable,
    queueLength,
    workerType,
  };
}

/**
 * Tutup koneksi Redis — dipanggil saat graceful shutdown worker.
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      // ignore
    }
    redisClient = null;
    redisAvailable = false;
    redisInitialized = false;
  }
}

/**
 * Utility: jalankan array Promise dengan batas concurrency.
 *
 * Contoh: pLimit(tasks, 10) — maks 10 promise berjalan bersamaan.
 *
 * @param tasks    Fungsi-fungsi yang masing-masing mengembalikan Promise
 * @param limit    Jumlah maksimum concurrent promise
 */
export async function pLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = index++;
      if (i >= tasks.length) break;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  // Jalankan `limit` worker secara paralel
  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}
