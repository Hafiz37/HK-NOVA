export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeoutMs: number;
  monitoringWindowMs: number;
  onStateChange?: (from: CircuitState, to: CircuitState, error?: Error) => void;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  uptime: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  resetTimeoutMs: 60000,
  monitoringWindowMs: 120000,
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private consecutiveFailures: number = 0;
  private consecutiveSuccesses: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttemptTime: number = 0;
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private createdAt: number = Date.now();
  
  constructor(
    private name: string,
    private options: CircuitBreakerOptions
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker [${this.name}] is OPEN. ` +
          `Retry after ${Math.ceil((this.nextAttemptTime - Date.now()) / 1000)}s`
        );
      }
      
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      const result = await Promise.race([
        operation(),
        this.timeoutPromise(),
      ]);

      this.onSuccess();
      return result;
      
    } catch (error) {
      this.onFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);
    });
  }

  private onSuccess(): void {
    this.successes++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.consecutiveSuccesses >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.resetCounters();
      }
    }
  }

  private onFailure(error: Error): void {
    this.failures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();
    this.totalFailures++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN, error);
      this.nextAttemptTime = Date.now() + this.options.resetTimeoutMs;
      return;
    }

    if (this.state === CircuitState.CLOSED) {
      if (this.consecutiveFailures >= this.options.failureThreshold) {
        this.transitionTo(CircuitState.OPEN, error);
        this.nextAttemptTime = Date.now() + this.options.resetTimeoutMs;
      }
    }
  }

  private transitionTo(newState: CircuitState, error?: Error): void {
    const oldState = this.state;
    
    if (oldState === newState) {
      return;
    }

    this.state = newState;

    if (this.options.onStateChange) {
      this.options.onStateChange(oldState, newState, error);
    }

    console.log(
      `[CircuitBreaker:${this.name}] State transition: ${oldState} → ${newState}` +
      (error ? ` (${error.message})` : '')
    );
  }

  private resetCounters(): void {
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      uptime: Date.now() - this.createdAt,
    };
  }

  getState(): CircuitState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.resetCounters();
    this.nextAttemptTime = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
  }
}

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  getOrCreate(
    name: string,
    options: Partial<CircuitBreakerOptions> = {}
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(
        name,
        new CircuitBreaker(name, { ...DEFAULT_OPTIONS, ...options })
      );
    }
    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

export const sshCircuitBreaker = (deviceId: string) =>
  circuitBreakerRegistry.getOrCreate(`ssh:${deviceId}`, {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 15000,
    resetTimeoutMs: 30000,
  });

export const snmpCircuitBreaker = (deviceId: string) =>
  circuitBreakerRegistry.getOrCreate(`snmp:${deviceId}`, {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 10000,
    resetTimeoutMs: 20000,
  });

export const databaseCircuitBreaker = circuitBreakerRegistry.getOrCreate('database', {
  failureThreshold: 10,
  successThreshold: 3,
  timeout: 5000,
  resetTimeoutMs: 10000,
});
