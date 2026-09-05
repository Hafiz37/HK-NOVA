import { describe, it, expect, vi } from 'vitest';
import { withTimeout, withGracefulDegradation, executeWithPartialResults, TimeoutError } from '@/lib/timeout';

describe('Timeout Management', () => {
  it('should complete operation within timeout', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await withTimeout(operation, 1000, 'test-op');

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should throw TimeoutError when operation exceeds timeout', async () => {
    vi.useFakeTimers();

    const slowOp = () => new Promise(resolve => setTimeout(() => resolve('too-late'), 2000));

    const promise = withTimeout(slowOp, 1000, 'slow-op');

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow(TimeoutError);
    await expect(promise).rejects.toThrow(/slow-op.*timed out after 1000ms/);

    vi.useRealTimers();
  });

  it('should use fallback on primary failure', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('Primary failed'));
    const fallback = vi.fn().mockResolvedValue('fallback-data');

    const result = await withGracefulDegradation({
      primary,
      fallback,
      timeoutMs: 1000,
    });

    expect(result.data).toBe('fallback-data');
    expect(result.source).toBe('fallback');
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('should use primary when successful', async () => {
    const primary = vi.fn().mockResolvedValue('primary-data');
    const fallback = vi.fn().mockResolvedValue('fallback-data');

    const result = await withGracefulDegradation({
      primary,
      fallback,
      timeoutMs: 1000,
    });

    expect(result.data).toBe('primary-data');
    expect(result.source).toBe('primary');
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('should throw when both primary and fallback fail', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('Primary failed'));
    const fallback = vi.fn().mockRejectedValue(new Error('Fallback failed'));

    await expect(
      withGracefulDegradation({ primary, fallback, timeoutMs: 1000 })
    ).rejects.toThrow(/Both primary and fallback operations failed/);
  });

  it('should collect partial results from multiple operations', async () => {
    const operations = [
      { id: 'op1', operation: vi.fn().mockResolvedValue('result1') },
      { id: 'op2', operation: vi.fn().mockRejectedValue(new Error('Failed')) },
      { id: 'op3', operation: vi.fn().mockResolvedValue('result3') },
    ];

    const result = await executeWithPartialResults({
      operations,
      timeoutMs: 1000,
      minSuccessCount: 2,
    });

    expect(result.successes).toHaveLength(2);
    expect(result.failures).toHaveLength(1);
    expect(result.successRate).toBeCloseTo(0.667, 2);
    expect(result.successes[0].data).toBe('result1');
    expect(result.successes[1].data).toBe('result3');
  });

  it('should throw when insufficient successes', async () => {
    const operations = [
      { id: 'op1', operation: vi.fn().mockRejectedValue(new Error('Failed')) },
      { id: 'op2', operation: vi.fn().mockRejectedValue(new Error('Failed')) },
      { id: 'op3', operation: vi.fn().mockResolvedValue('result3') },
    ];

    await expect(
      executeWithPartialResults({
        operations,
        timeoutMs: 1000,
        minSuccessCount: 2,
      })
    ).rejects.toThrow(/Insufficient successful operations: 1\/2 required/);
  });
});
