import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deviceQueue, getDeviceQueueMetrics } from '../../src/lib/device-operation-queue';

describe('Device Operation Queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await deviceQueue.shutdown();
    vi.useRealTimers();
  });

  it('should enforce SSH concurrency limit (1 per device)', async () => {
    const deviceId = 'test-device-1';
    let concurrent = 0;
    let maxConcurrent = 0;

    const operation = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(resolve => setTimeout(resolve, 100));
      concurrent--;
      return 'done';
    };

    const promises = Array(5).fill(null).map(() =>
      deviceQueue.enqueue(deviceId, 'ssh', operation)
    );

    await Promise.all(promises);

    expect(maxConcurrent).toBe(1);
  });

  it('should enforce SNMP rate limit (5 per minute)', async () => {
    const deviceId = 'test-device-2';
    let successCount = 0;
    let errorCount = 0;

    const operation = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'done';
    };

    for (let i = 0; i < 7; i++) {
      try {
        await deviceQueue.enqueue(deviceId, 'snmp', operation);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }

    expect(successCount).toBeLessThanOrEqual(5);
    expect(errorCount).toBeGreaterThan(0);
  });

  it('should track metrics correctly', async () => {
    const deviceId = 'test-device-3';

    await deviceQueue.enqueue(deviceId, 'ssh', async () => 'success');

    const metrics = getDeviceQueueMetrics(deviceId);
    expect(metrics).toBeDefined();
    expect(metrics?.completed).toBeGreaterThan(0);
  });

  it('should handle queue overflow for SSH operations', async () => {
    const deviceId = 'test-device-4';

    const slowOperation = async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return 'done';
    };

    const promises = Array(15).fill(null).map((_, i) =>
      deviceQueue.enqueue(deviceId, 'ssh', slowOperation).catch(err => err)
    );

    const results = await Promise.all(promises);
    const errors = results.filter(r => r instanceof Error);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('Queue overflow'))).toBe(true);
  });

  it('should process operations by priority', async () => {
    const deviceId = 'test-device-5';
    const executionOrder: number[] = [];

    const operation = (priority: number) => async () => {
      executionOrder.push(priority);
      await new Promise(resolve => setTimeout(resolve, 10));
      return priority;
    };

    await deviceQueue.enqueue(deviceId, 'ssh', operation(1), 1);
    await deviceQueue.enqueue(deviceId, 'ssh', operation(5), 5);
    await deviceQueue.enqueue(deviceId, 'ssh', operation(3), 3);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(executionOrder[0]).toBe(5);
  });

  it('should clear device queue', async () => {
    const deviceId = 'test-device-6';

    await deviceQueue.enqueue(deviceId, 'ssh', async () => 'test');

    deviceQueue.clearDevice(deviceId);

    const queueLength = deviceQueue.getQueueLength(deviceId);
    expect(queueLength).toBe(0);
  });
});
