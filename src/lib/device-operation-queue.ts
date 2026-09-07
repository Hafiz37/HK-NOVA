import { EventEmitter } from 'events';

interface QueuedOperation {
  id: string;
  deviceId: string;
  type: 'ssh' | 'snmp' | 'icmp';
  priority: number;
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

interface DeviceQueueMetrics {
  pending: number;
  executing: number;
  completed: number;
  failed: number;
  avgWaitTime: number;
  lastOperationAt: number;
}

class DeviceOperationQueue extends EventEmitter {
  private queues: Map<string, QueuedOperation[]> = new Map();
  private executing: Map<string, Set<string>> = new Map();
  private metrics: Map<string, DeviceQueueMetrics> = new Map();
  
  private readonly limits = {
    ssh: {
      maxConcurrentPerDevice: 1,
      maxQueueSize: 10,
    },
    snmp: {
      maxConcurrentPerDevice: 3,
      maxPerMinute: 5,
    },
    icmp: {
      maxConcurrentPerDevice: 5,
      maxPerMinute: 10,
    },
  };
  
  private rateLimitTrackers: Map<string, number[]> = new Map();

  constructor() {
    super();
    this.startMetricsCollector();
  }

  async enqueue<T>(
    deviceId: string,
    type: 'ssh' | 'snmp' | 'icmp',
    operation: () => Promise<T>,
    priority = 0
  ): Promise<T> {
    const operationId = `${deviceId}-${type}-${Date.now()}-${Math.random()}`;
    
    if (!this.queues.has(deviceId)) {
      this.queues.set(deviceId, []);
      this.executing.set(deviceId, new Set());
      this.metrics.set(deviceId, {
        pending: 0,
        executing: 0,
        completed: 0,
        failed: 0,
        avgWaitTime: 0,
        lastOperationAt: Date.now(),
      });
    }

    const queue = this.queues.get(deviceId)!;
    
    const limit = this.limits[type];
    if (type === 'ssh' && queue.length >= limit.maxQueueSize) {
      throw new Error(`Queue overflow for device ${deviceId}: max ${limit.maxQueueSize} operations`);
    }

    if (this.isRateLimited(deviceId, type)) {
      throw new Error(`Rate limit exceeded for device ${deviceId} (${type})`);
    }

    return new Promise<T>((resolve, reject) => {
      const queuedOp: QueuedOperation = {
        id: operationId,
        deviceId,
        type,
        priority,
        execute: operation,
        resolve: resolve as (value: unknown) => void,
        reject,
        enqueuedAt: Date.now(),
      };

      queue.push(queuedOp);
      queue.sort((a, b) => b.priority - a.priority);

      const metrics = this.metrics.get(deviceId)!;
      metrics.pending = queue.length;

      this.emit('enqueued', { deviceId, operationId, type, queueLength: queue.length });
      
      void this.processQueue(deviceId);
    });
  }

  private async processQueue(deviceId: string): Promise<void> {
    const queue = this.queues.get(deviceId);
    const executingSet = this.executing.get(deviceId);
    
    if (!queue || !executingSet) return;

    while (queue.length > 0) {
      const nextOp = queue[0];
      const limit = this.limits[nextOp.type];

      const currentExecuting = Array.from(executingSet)
        .filter(id => id.includes(nextOp.type))
        .length;

      if (nextOp.type === 'ssh' && currentExecuting >= limit.maxConcurrentPerDevice) {
        break;
      }
      if (nextOp.type === 'snmp' && currentExecuting >= limit.maxConcurrentPerDevice) {
        break;
      }
      if (nextOp.type === 'icmp' && currentExecuting >= limit.maxConcurrentPerDevice) {
        break;
      }

      if (this.isRateLimited(deviceId, nextOp.type)) {
        break;
      }

      queue.shift();
      executingSet.add(nextOp.id);

      const metrics = this.metrics.get(deviceId)!;
      metrics.pending = queue.length;
      metrics.executing = executingSet.size;
      
      const waitTime = Date.now() - nextOp.enqueuedAt;
      metrics.avgWaitTime = (metrics.avgWaitTime * metrics.completed + waitTime) / (metrics.completed + 1);

      this.trackRateLimit(deviceId, nextOp.type);

      this.emit('executing', { 
        deviceId, 
        operationId: nextOp.id, 
        type: nextOp.type,
        waitTime 
      });

      void this.executeOperation(nextOp);
    }
  }

  private async executeOperation(op: QueuedOperation): Promise<void> {
    const startTime = Date.now();
    
    try {
      const result = await op.execute();
      
      const executingSet = this.executing.get(op.deviceId);
      if (executingSet) {
        executingSet.delete(op.id);
      }

      const metrics = this.metrics.get(op.deviceId);
      if (metrics) {
        metrics.completed++;
        metrics.executing = executingSet?.size ?? 0;
        metrics.lastOperationAt = Date.now();
      }

      this.emit('completed', {
        deviceId: op.deviceId,
        operationId: op.id,
        type: op.type,
        duration: Date.now() - startTime,
      });

      op.resolve(result);
      
      void this.processQueue(op.deviceId);
      
    } catch (error) {
      const executingSet = this.executing.get(op.deviceId);
      if (executingSet) {
        executingSet.delete(op.id);
      }

      const metrics = this.metrics.get(op.deviceId);
      if (metrics) {
        metrics.failed++;
        metrics.executing = executingSet?.size ?? 0;
        metrics.lastOperationAt = Date.now();
      }

      this.emit('failed', {
        deviceId: op.deviceId,
        operationId: op.id,
        type: op.type,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      });

      op.reject(error instanceof Error ? error : new Error('Operation failed'));
      
      void this.processQueue(op.deviceId);
    }
  }

  private isRateLimited(deviceId: string, type: 'ssh' | 'snmp' | 'icmp'): boolean {
    if (type === 'ssh') return false;

    const key = `${deviceId}-${type}`;
    const timestamps = this.rateLimitTrackers.get(key) || [];
    
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    const recentOps = timestamps.filter(t => t > oneMinuteAgo);

    const limit = this.limits[type];
    const maxPerMinute = 'maxPerMinute' in limit ? limit.maxPerMinute : Infinity;

    return recentOps.length >= maxPerMinute;
  }

  private trackRateLimit(deviceId: string, type: 'ssh' | 'snmp' | 'icmp'): void {
    const key = `${deviceId}-${type}`;
    const timestamps = this.rateLimitTrackers.get(key) || [];
    
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    const recentOps = timestamps.filter(t => t > oneMinuteAgo);
    recentOps.push(now);
    
    this.rateLimitTrackers.set(key, recentOps);
  }

  getMetrics(deviceId?: string): Map<string, DeviceQueueMetrics> | DeviceQueueMetrics | null {
    if (deviceId) {
      return this.metrics.get(deviceId) || null;
    }
    return this.metrics;
  }

  getQueueLength(deviceId: string): number {
    return this.queues.get(deviceId)?.length ?? 0;
  }

  clearDevice(deviceId: string): void {
    const queue = this.queues.get(deviceId);
    if (queue) {
      queue.forEach(op => {
        op.reject(new Error('Queue cleared'));
      });
      queue.length = 0;
    }
    
    this.queues.delete(deviceId);
    this.executing.delete(deviceId);
    this.metrics.delete(deviceId);
    
    const keysToDelete = Array.from(this.rateLimitTrackers.keys())
      .filter(k => k.startsWith(`${deviceId}-`));
    keysToDelete.forEach(k => this.rateLimitTrackers.delete(k));
  }

  private startMetricsCollector(): void {
    setInterval(() => {
      const now = Date.now();
      const staleThreshold = 3600_000;

      for (const [deviceId, metrics] of this.metrics.entries()) {
        if (now - metrics.lastOperationAt > staleThreshold) {
          if (this.getQueueLength(deviceId) === 0) {
            this.clearDevice(deviceId);
          }
        }
      }

      for (const [key, timestamps] of this.rateLimitTrackers.entries()) {
        const oneMinuteAgo = now - 60_000;
        const recent = timestamps.filter(t => t > oneMinuteAgo);
        if (recent.length === 0) {
          this.rateLimitTrackers.delete(key);
        } else {
          this.rateLimitTrackers.set(key, recent);
        }
      }
    }, 300_000);
  }

  async shutdown(): Promise<void> {
    this.emit('shutdown');
    
    for (const [deviceId, queue] of this.queues.entries()) {
      queue.forEach(op => {
        op.reject(new Error('Queue shutting down'));
      });
      queue.length = 0;
    }

    const allExecuting = Array.from(this.executing.values())
      .flatMap(set => Array.from(set));
    
    if (allExecuting.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    this.queues.clear();
    this.executing.clear();
    this.metrics.clear();
    this.rateLimitTrackers.clear();
  }
}

export const deviceQueue = new DeviceOperationQueue();

export function getDeviceQueueMetrics(deviceId?: string) {
  return deviceQueue.getMetrics(deviceId);
}

export function getDeviceQueueLength(deviceId: string): number {
  return deviceQueue.getQueueLength(deviceId);
}
