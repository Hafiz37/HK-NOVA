import Redis from 'ioredis';

export interface RateLimiterConfig {
  maxConcurrent?: number;
  quietPeriodMs?: number;
  circuitBreakerThreshold?: number;
}

export class DeviceRateLimiter {
  private redis: Redis | null = null;
  private memoryQueue: Map<string, Array<() => void>> = new Map();
  private memoryActiveOps: Map<string, number> = new Map();
  private memoryLastOpTime: Map<string, number> = new Map();
  private memoryFailures: Map<string, number> = new Map();

  private readonly maxConcurrent: number;
  private readonly quietPeriodMs: number;
  private readonly circuitBreakerThreshold: number;

  constructor(config?: RateLimiterConfig) {
    this.maxConcurrent = config?.maxConcurrent ?? 2;
    this.quietPeriodMs = config?.quietPeriodMs ?? 2000;
    this.circuitBreakerThreshold = config?.circuitBreakerThreshold ?? 5;

    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: false,
          lazyConnect: true,
        });
        this.redis.connect().catch((err) => {
          console.warn('[DeviceRateLimiter] Redis connection failed, fallback to in-memory:', err.message);
          this.redis = null;
        });
      } catch (err) {
        console.warn('[DeviceRateLimiter] Redis init failed, using in-memory mode');
      }
    }
  }

  async canExecute(deviceId: string, operationType: string = 'provision'): Promise<boolean> {
    const isCircuitOpen = await this.isCircuitOpen(deviceId);
    if (isCircuitOpen) {
      console.warn(`[DeviceRateLimiter] Circuit breaker is OPEN for device ${deviceId}`);
      return false;
    }

    if (this.redis) {
      return this.canExecuteRedis(deviceId);
    } else {
      return this.canExecuteMemory(deviceId);
    }
  }

  async acquireLock(deviceId: string, operationType: string = 'provision'): Promise<() => void> {
    const canRun = await this.canExecute(deviceId, operationType);
    
    if (canRun) {
      await this.recordStart(deviceId);
      return () => this.releaseLock(deviceId, true);
    }

    return new Promise((resolve, reject) => {
      const queue = this.memoryQueue.get(deviceId) || [];
      
      const timeout = setTimeout(() => {
        const idx = queue.indexOf(execute);
        if (idx !== -1) queue.splice(idx, 1);
        reject(new Error(`Rate limit queue timeout for device ${deviceId}`));
      }, 30000);

      const execute = async () => {
        clearTimeout(timeout);
        await this.recordStart(deviceId);
        resolve(() => this.releaseLock(deviceId, true));
      };

      queue.push(execute);
      this.memoryQueue.set(deviceId, queue);
    });
  }

  private async canExecuteMemory(deviceId: string): Promise<boolean> {
    const active = this.memoryActiveOps.get(deviceId) || 0;
    if (active >= this.maxConcurrent) {
      return false;
    }

    const lastTime = this.memoryLastOpTime.get(deviceId) || 0;
    const now = Date.now();
    if (now - lastTime < this.quietPeriodMs) {
      return false;
    }

    return true;
  }

  private async canExecuteRedis(deviceId: string): Promise<boolean> {
    if (!this.redis) return this.canExecuteMemory(deviceId);

    try {
      const activeKey = `device:limit:${deviceId}:active`;
      const lastKey = `device:limit:${deviceId}:last`;

      const active = parseInt((await this.redis.get(activeKey)) || '0');
      if (active >= this.maxConcurrent) {
        return false;
      }

      const lastTime = parseInt((await this.redis.get(lastKey)) || '0');
      const now = Date.now();
      if (now - lastTime < this.quietPeriodMs) {
        return false;
      }

      return true;
    } catch (err) {
      console.warn('[DeviceRateLimiter] Redis error, fallback to memory:', err);
      return this.canExecuteMemory(deviceId);
    }
  }

  private async recordStart(deviceId: string): Promise<void> {
    const now = Date.now();

    if (this.redis) {
      try {
        const activeKey = `device:limit:${deviceId}:active`;
        const lastKey = `device:limit:${deviceId}:last`;

        await this.redis.incr(activeKey);
        await this.redis.set(lastKey, now.toString());
        await this.redis.expire(activeKey, 60);
      } catch (err) {
        this.recordStartMemory(deviceId, now);
      }
    } else {
      this.recordStartMemory(deviceId, now);
    }
  }

  private recordStartMemory(deviceId: string, now: number): void {
    const active = this.memoryActiveOps.get(deviceId) || 0;
    this.memoryActiveOps.set(deviceId, active + 1);
    this.memoryLastOpTime.set(deviceId, now);
  }

  async releaseLock(deviceId: string, success: boolean = true): Promise<void> {
    await this.recordCompletion(deviceId, success);

    if (this.redis) {
      try {
        const activeKey = `device:limit:${deviceId}:active`;
        await this.redis.decr(activeKey);
      } catch (err) {
        this.releaseLockMemory(deviceId);
      }
    } else {
      this.releaseLockMemory(deviceId);
    }

    this.processQueue(deviceId);
  }

  private releaseLockMemory(deviceId: string): void {
    const active = this.memoryActiveOps.get(deviceId) || 0;
    this.memoryActiveOps.set(deviceId, Math.max(0, active - 1));
  }

  private async processQueue(deviceId: string): Promise<void> {
    const queue = this.memoryQueue.get(deviceId) || [];
    if (queue.length === 0) return;

    const canRun = await this.canExecute(deviceId);
    if (canRun) {
      const nextOp = queue.shift();
      if (nextOp) {
        this.memoryQueue.set(deviceId, queue);
        nextOp();
      }
    }
  }

  async recordExecution(deviceId: string, operationType: string, success: boolean): Promise<void> {
    await this.recordCompletion(deviceId, success);
  }

  private async recordCompletion(deviceId: string, success: boolean): Promise<void> {
    if (success) {
      this.memoryFailures.set(deviceId, 0);
      if (this.redis) {
        try {
          await this.redis.del(`device:limit:${deviceId}:failures`);
        } catch (err) {
          // ignore
        }
      }
    } else {
      const failures = (this.memoryFailures.get(deviceId) || 0) + 1;
      this.memoryFailures.set(deviceId, failures);

      if (this.redis) {
        try {
          const failKey = `device:limit:${deviceId}:failures`;
          await this.redis.incr(failKey);
          await this.redis.expire(failKey, 300);
        } catch (err) {
          // ignore
        }
      }

      if (failures >= this.circuitBreakerThreshold) {
        console.error(`[DeviceRateLimiter] Circuit breaker TRIP for device ${deviceId} after ${failures} failures`);
        await this.openCircuit(deviceId);
      }
    }
  }

  private async isCircuitOpen(deviceId: string): Promise<boolean> {
    const circuitKey = `device:circuit:${deviceId}:open`;

    if (this.redis) {
      try {
        const isOpen = await this.redis.get(circuitKey);
        return isOpen === '1';
      } catch (err) {
        return this.isCircuitOpenMemory(deviceId);
      }
    } else {
      return this.isCircuitOpenMemory(deviceId);
    }
  }

  private isCircuitOpenMemory(deviceId: string): boolean {
    const failures = this.memoryFailures.get(deviceId) || 0;
    return failures >= this.circuitBreakerThreshold;
  }

  private async openCircuit(deviceId: string): Promise<void> {
    const circuitKey = `device:circuit:${deviceId}:open`;
    if (this.redis) {
      try {
        await this.redis.set(circuitKey, '1', 'EX', 60);
      } catch (err) {
        // ignore
      }
    }
  }

  async getDeviceStatus(deviceId: string): Promise<{
    activeOps: number;
    queueLength: number;
    circuitOpen: boolean;
    consecutiveFailures: number;
  }> {
    const active = this.memoryActiveOps.get(deviceId) || 0;
    const queue = (this.memoryQueue.get(deviceId) || []).length;
    const circuitOpen = await this.isCircuitOpen(deviceId);
    const failures = this.memoryFailures.get(deviceId) || 0;

    return {
      activeOps: active,
      queueLength: queue,
      circuitOpen,
      consecutiveFailures: failures,
    };
  }
}

export const deviceRateLimiter = new DeviceRateLimiter();
