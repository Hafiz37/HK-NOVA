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
  monitoringWindowMs?: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextAttemptTime?: number;
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private consecutiveFailures: number = 0;
  private consecutiveSuccesses: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttemptTime?: number;
  private failureTimestamps: number[] = [];

  constructor(
    private readonly key: string,
    private readonly options: CircuitBreakerOptions
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < (this.nextAttemptTime || 0)) {
        throw new Error(
          `Circuit breaker is OPEN for ${this.key}. Next attempt at ${new Date(
            this.nextAttemptTime!
          ).toISOString()}`
        );
      }
      this.state = CircuitState.HALF_OPEN;
      this.consecutiveSuccesses = 0;
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Operation timeout after ${this.options.timeout}ms`)),
        this.options.timeout
      )
    );

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.consecutiveSuccesses >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.failureTimestamps = [];
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();
    this.failureTimestamps.push(Date.now());

    const windowMs = this.options.monitoringWindowMs || 60000;
    this.failureTimestamps = this.failureTimestamps.filter(
      (ts) => Date.now() - ts < windowMs
    );

    if (this.state === CircuitState.HALF_OPEN) {
      this.tripCircuit();
    } else if (
      this.state === CircuitState.CLOSED &&
      this.failureTimestamps.length >= this.options.failureThreshold
    ) {
      this.tripCircuit();
    }
  }

  private tripCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.options.resetTimeoutMs;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.failureTimestamps = [];
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextAttemptTime = undefined;
  }
}

const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  key: string,
  options: CircuitBreakerOptions
): CircuitBreaker {
  if (!circuitBreakers.has(key)) {
    circuitBreakers.set(key, new CircuitBreaker(key, options));
  }
  return circuitBreakers.get(key)!;
}

export function getCircuitBreakerMetrics(key: string): CircuitBreakerMetrics | null {
  const breaker = circuitBreakers.get(key);
  return breaker ? breaker.getMetrics() : null;
}

export function getAllCircuitBreakerMetrics(): Record<string, CircuitBreakerMetrics> {
  const metrics: Record<string, CircuitBreakerMetrics> = {};
  circuitBreakers.forEach((breaker, key) => {
    metrics[key] = breaker.getMetrics();
  });
  return metrics;
}

export function resetCircuitBreaker(key: string): boolean {
  const breaker = circuitBreakers.get(key);
  if (breaker) {
    breaker.reset();
    return true;
  }
  return false;
}

export function resetAllCircuitBreakers(): void {
  circuitBreakers.forEach((breaker) => breaker.reset());
}

export const circuitBreakerRegistry = {
  getAllStats: () => getAllCircuitBreakerMetrics(),
  get: (key: string) => circuitBreakers.get(key),
  resetAll: () => resetAllCircuitBreakers(),
};

export function sshCircuitBreaker(deviceId: string): CircuitBreaker {
  return getCircuitBreaker(`ssh:${deviceId}`, {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 10000,
    resetTimeoutMs: 30000,
  });
}

export { CircuitBreaker };
