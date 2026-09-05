import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff, sshRetry, databaseRetry } from '@/lib/retry';

describe('Retry Mechanism', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(operation, { maxAttempts: 3 });

    expect(result.success).toBe(true);
    expect(result.data).toBe('success');
    expect(result.attempts).toBe(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(operation, {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.data).toBe('success');
    expect(result.attempts).toBe(3);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable error', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Invalid credentials'));

    const result = await retryWithBackoff(operation, {
      maxAttempts: 3,
      retryableErrors: (err) => err.message.includes('timeout'),
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should respect max attempts', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Connection timeout'));

    const promise = retryWithBackoff(operation, {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should call onRetry callback', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('success');

    const onRetry = vi.fn();

    const promise = retryWithBackoff(operation, {
      maxAttempts: 3,
      initialDelayMs: 1000,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(1000);

    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'timeout' }),
      1,
      expect.any(Number)
    );
  });

  it('should work with RetryableOperation class', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockResolvedValue('success');

    const promise = sshRetry.execute(operation);

    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
