import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitState } from '@/lib/circuit-breaker';

describe('Circuit Breaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-breaker', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      resetTimeoutMs: 5000,
      monitoringWindowMs: 10000,
    });
  });

  it('should start in CLOSED state', () => {
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(breaker.isClosed()).toBe(true);
  });

  it('should transition to OPEN after threshold failures', async () => {
    const failingOp = vi.fn().mockRejectedValue(new Error('Failed'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp)).rejects.toThrow('Failed');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);
    expect(breaker.isOpen()).toBe(true);
  });

  it('should reject requests when OPEN', async () => {
    const failingOp = vi.fn().mockRejectedValue(new Error('Failed'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp)).rejects.toThrow();
    }

    expect(breaker.isOpen()).toBe(true);

    await expect(breaker.execute(vi.fn())).rejects.toThrow(/Circuit breaker.*is OPEN/);
  });

  it('should transition to HALF_OPEN after reset timeout', async () => {
    vi.useFakeTimers();

    const failingOp = vi.fn().mockRejectedValue(new Error('Failed'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp)).rejects.toThrow();
    }

    expect(breaker.isOpen()).toBe(true);

    vi.advanceTimersByTime(5000);

    const successOp = vi.fn().mockResolvedValue('success');
    const promise = breaker.execute(successOp);

    await vi.runAllTimersAsync();
    await promise;

    expect(breaker.isClosed()).toBe(true);

    vi.useRealTimers();
  });

  it('should return to CLOSED after successful operations in HALF_OPEN', async () => {
    vi.useFakeTimers();

    const failingOp = vi.fn().mockRejectedValue(new Error('Failed'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp)).rejects.toThrow();
    }

    vi.advanceTimersByTime(5000);

    const successOp = vi.fn().mockResolvedValue('success');

    await breaker.execute(successOp);
    await breaker.execute(successOp);

    expect(breaker.isClosed()).toBe(true);

    vi.useRealTimers();
  });

  it('should track statistics correctly', async () => {
    const successOp = vi.fn().mockResolvedValue('success');
    const failingOp = vi.fn().mockRejectedValue(new Error('Failed'));

    await breaker.execute(successOp);
    await breaker.execute(successOp);
    await expect(breaker.execute(failingOp)).rejects.toThrow();

    const stats = breaker.getStats();

    expect(stats.totalRequests).toBe(3);
    expect(stats.totalSuccesses).toBe(2);
    expect(stats.totalFailures).toBe(1);
  });

  it('should handle timeout', async () => {
    const slowOp = () => new Promise(resolve => setTimeout(resolve, 2000));

    await expect(breaker.execute(slowOp)).rejects.toThrow(/timeout/);
  });

  it('should reset correctly', async () => {
    const failingOp = vi.fn().mockRejectedValue(new Error('Failed'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp)).rejects.toThrow();
    }

    expect(breaker.isOpen()).toBe(true);

    breaker.reset();

    expect(breaker.isClosed()).toBe(true);
    expect(breaker.getStats().consecutiveFailures).toBe(0);
  });
});
