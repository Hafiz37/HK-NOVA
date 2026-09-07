export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
  halfOpenMaxRequests?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastStateChangeTime: number = Date.now();
  private halfOpenRequests: number = 0;

  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly halfOpenMaxRequests: number;

  constructor(options?: CircuitBreakerOptions) {
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options?.recoveryTimeoutMs ?? 60000; // 60 seconds
    this.halfOpenMaxRequests = options?.halfOpenMaxRequests ?? 2;
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    this.evaluateState();

    if (this.state === CircuitState.OPEN) {
      throw new Error(`Circuit breaker is OPEN. Fast failing request.`);
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenRequests >= this.halfOpenMaxRequests) {
        throw new Error(`Circuit breaker is HALF_OPEN. Max test requests reached.`);
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private evaluateState(): void {
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      if (now - this.lastStateChangeTime >= this.recoveryTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxRequests) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }
  }

  private onFailure(error: any): void {
    this.failureCount++;
    console.error(`[CircuitBreaker] Failure recorded (${this.failureCount}/${this.failureThreshold}):`, error?.message || error);

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failureCount >= this.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    console.warn(`[CircuitBreaker] State transition: ${this.state} → ${newState}`);
    this.state = newState;
    this.lastStateChangeTime = Date.now();

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenRequests = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
      this.halfOpenRequests = 0;
    } else if (newState === CircuitState.OPEN) {
      this.halfOpenRequests = 0;
    }
  }

  getState(): CircuitState {
    this.evaluateState();
    return this.state;
  }

  getMetrics(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastStateChangeTime: number;
  } {
    this.evaluateState();
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastStateChangeTime: this.lastStateChangeTime,
    };
  }

  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }
}

class DeviceCircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();

  getBreaker(deviceId: string): CircuitBreaker {
    let breaker = this.breakers.get(deviceId);
    if (!breaker) {
      breaker = new CircuitBreaker();
      this.breakers.set(deviceId, breaker);
    }
    return breaker;
  }

  async execute<T>(deviceId: string, action: () => Promise<T>): Promise<T> {
    const breaker = this.getBreaker(deviceId);
    return breaker.execute(action);
  }

  getDeviceState(deviceId: string): CircuitState {
    const breaker = this.breakers.get(deviceId);
    return breaker ? breaker.getState() : CircuitState.CLOSED;
  }

  resetDevice(deviceId: string): void {
    const breaker = this.breakers.get(deviceId);
    if (breaker) {
      breaker.reset();
    }
  }
}

export const deviceCircuitBreakerManager = new DeviceCircuitBreakerManager();
