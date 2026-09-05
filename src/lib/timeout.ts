export interface TimeoutOptions {
  operationTimeoutMs: number;
  gracePeriodMs?: number;
  onTimeout?: (operationName: string) => void;
}

export class TimeoutError extends Error {
  constructor(
    public operationName: string,
    public timeoutMs: number
  ) {
    super(`Operation '${operationName}' timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([operation(), timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

export class TimeoutManager {
  private activeOperations = new Map<string, NodeJS.Timeout>();

  async execute<T>(
    operationId: string,
    operation: () => Promise<T>,
    options: TimeoutOptions
  ): Promise<T> {
    if (this.activeOperations.has(operationId)) {
      throw new Error(`Operation ${operationId} is already running`);
    }

    const timeoutHandle = setTimeout(() => {
      this.activeOperations.delete(operationId);
      if (options.onTimeout) {
        options.onTimeout(operationId);
      }
    }, options.operationTimeoutMs);

    this.activeOperations.set(operationId, timeoutHandle);

    try {
      const result = await withTimeout(
        operation,
        options.operationTimeoutMs,
        operationId
      );
      
      clearTimeout(timeoutHandle);
      this.activeOperations.delete(operationId);
      
      return result;
    } catch (error) {
      clearTimeout(timeoutHandle);
      this.activeOperations.delete(operationId);
      throw error;
    }
  }

  cancelOperation(operationId: string): boolean {
    const timeoutHandle = this.activeOperations.get(operationId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.activeOperations.delete(operationId);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const timeoutHandle of this.activeOperations.values()) {
      clearTimeout(timeoutHandle);
    }
    this.activeOperations.clear();
  }

  getActiveOperations(): string[] {
    return Array.from(this.activeOperations.keys());
  }
}

export const globalTimeoutManager = new TimeoutManager();

export const OPERATION_TIMEOUTS = {
  SSH_COMMAND: 15000,
  SSH_INTERACTIVE: 30000,
  SNMP_GET: 10000,
  SNMP_WALK: 30000,
  DATABASE_QUERY: 5000,
  API_REQUEST: 30000,
  BACKUP_OPERATION: 120000,
  PROVISIONING: 60000,
} as const;

export interface GracefulDegradationOptions<T> {
  primary: () => Promise<T>;
  fallback: () => Promise<T>;
  timeoutMs: number;
  preferPrimary?: boolean;
}

export async function withGracefulDegradation<T>(
  options: GracefulDegradationOptions<T>
): Promise<{ data: T; source: 'primary' | 'fallback' }> {
  try {
    const data = await withTimeout(
      options.primary,
      options.timeoutMs,
      'primary-operation'
    );
    return { data, source: 'primary' };
  } catch (error) {
    console.warn('Primary operation failed, falling back:', error);
    
    try {
      const data = await options.fallback();
      return { data, source: 'fallback' };
    } catch (fallbackError) {
      throw new Error(
        `Both primary and fallback operations failed. ` +
        `Primary: ${error instanceof Error ? error.message : String(error)}, ` +
        `Fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
      );
    }
  }
}

export interface PartialResultOptions<T> {
  operations: Array<{ id: string; operation: () => Promise<T> }>;
  timeoutMs: number;
  minSuccessCount?: number;
}

export interface PartialResult<T> {
  successes: Array<{ id: string; data: T }>;
  failures: Array<{ id: string; error: Error }>;
  totalCount: number;
  successRate: number;
}

export async function executeWithPartialResults<T>(
  options: PartialResultOptions<T>
): Promise<PartialResult<T>> {
  const minSuccessCount = options.minSuccessCount ?? 1;
  const results = await Promise.allSettled(
    options.operations.map(({ id, operation }) =>
      withTimeout(operation, options.timeoutMs, id)
        .then(data => ({ id, data }))
        .catch(error => ({ id, error }))
    )
  );

  const successes: Array<{ id: string; data: T }> = [];
  const failures: Array<{ id: string; error: Error }> = [];

  results.forEach((result, index) => {
    const { id } = options.operations[index];
    
    if (result.status === 'fulfilled') {
      const value = result.value;
      if ('error' in value) {
        failures.push({ id, error: value.error });
      } else {
        successes.push({ id, data: value.data });
      }
    } else {
      failures.push({
        id,
        error: result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason))
      });
    }
  });

  const successRate = successes.length / options.operations.length;

  if (successes.length < minSuccessCount) {
    throw new Error(
      `Insufficient successful operations: ${successes.length}/${minSuccessCount} required. ` +
      `Failures: ${failures.map(f => `${f.id}: ${f.error.message}`).join(', ')}`
    );
  }

  return {
    successes,
    failures,
    totalCount: options.operations.length,
    successRate,
  };
}

export interface BulkheadOptions {
  maxConcurrent: number;
  maxQueued: number;
  queueTimeoutMs: number;
}

export class Bulkhead {
  private running = 0;
  private queue: Array<{
    operation: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    queuedAt: number;
  }> = [];

  constructor(private options: BulkheadOptions) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.running < this.options.maxConcurrent) {
      return this.runOperation(operation);
    }

    if (this.queue.length >= this.options.maxQueued) {
      throw new Error(
        `Bulkhead queue full (${this.options.maxQueued}). Request rejected.`
      );
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        operation,
        resolve,
        reject,
        queuedAt: Date.now(),
      });

      setTimeout(() => {
        const index = this.queue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error('Queued operation timed out'));
        }
      }, this.options.queueTimeoutMs);
    });
  }

  private async runOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.running++;
    
    try {
      const result = await operation();
      return result;
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.running >= this.options.maxConcurrent) {
      return;
    }

    const item = this.queue.shift()!;
    
    const queueTime = Date.now() - item.queuedAt;
    if (queueTime > this.options.queueTimeoutMs) {
      item.reject(new Error('Queued operation timed out'));
      this.processQueue();
      return;
    }

    this.runOperation(item.operation)
      .then(item.resolve)
      .catch(item.reject);
  }

  getStats() {
    return {
      running: this.running,
      queued: this.queue.length,
      capacity: this.options.maxConcurrent,
      utilization: this.running / this.options.maxConcurrent,
    };
  }
}

export const sshBulkhead = new Bulkhead({
  maxConcurrent: 50,
  maxQueued: 100,
  queueTimeoutMs: 30000,
});

export const databaseBulkhead = new Bulkhead({
  maxConcurrent: 100,
  maxQueued: 200,
  queueTimeoutMs: 10000,
});
