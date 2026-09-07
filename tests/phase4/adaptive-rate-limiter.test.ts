import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { initAdaptiveRateLimiter } from '../../src/lib/adaptive-rate-limiter';

const prisma = new PrismaClient();

describe('Adaptive Rate Limiter', () => {
  let rateLimiter: ReturnType<typeof initAdaptiveRateLimiter>;

  beforeEach(() => {
    rateLimiter = initAdaptiveRateLimiter(prisma);
  });

  afterEach(async () => {
    await rateLimiter.shutdown();
  });

  it('should allow operations when device is healthy', async () => {
    const deviceId = 'healthy-device';

    const shouldSkip = rateLimiter.shouldSkipOperation(deviceId, 'icmp');
    expect(shouldSkip).toBe(false);
  });

  it('should skip backup when CPU usage is high', async () => {
    const deviceId = 'high-cpu-device';

    await prisma.device.upsert({
      where: { id: deviceId },
      create: {
        id: deviceId,
        name: 'High CPU Device',
        ip: '192.168.1.100',
        type: 'ROUTER',
        status: 'UP',
      },
      update: {},
    });

    await prisma.metric.create({
      data: {
        deviceId,
        metricType: 'SNMP',
        cpuUtil: 85,
        memUtil: 50,
      },
    });

    await rateLimiter.updateDeviceHealth(deviceId);

    const shouldSkipBackup = rateLimiter.shouldSkipOperation(deviceId, 'backup');
    expect(shouldSkipBackup).toBe(true);
  });

  it('should adjust polling interval based on response time', async () => {
    const deviceId = 'slow-device';

    await prisma.device.upsert({
      where: { id: deviceId },
      create: {
        id: deviceId,
        name: 'Slow Device',
        ip: '192.168.1.101',
        type: 'ROUTER',
        status: 'UP',
      },
      update: {},
    });

    for (let i = 0; i < 5; i++) {
      await prisma.metric.create({
        data: {
          deviceId,
          metricType: 'ICMP',
          latency: 500 + i * 100,
          packetLoss: 0,
        },
      });
    }

    await rateLimiter.updateDeviceHealth(deviceId);

    const config = rateLimiter.getRateLimitConfig(deviceId);
    expect(config.icmpInterval).toBeGreaterThan(60000);
  });

  it('should back off on high error rate', async () => {
    const deviceId = 'error-device';

    await prisma.device.upsert({
      where: { id: deviceId },
      create: {
        id: deviceId,
        name: 'Error Device',
        ip: '192.168.1.102',
        type: 'ROUTER',
        status: 'UP',
      },
      update: {},
    });

    for (let i = 0; i < 10; i++) {
      await prisma.metric.create({
        data: {
          deviceId,
          metricType: 'ICMP',
          latency: i % 2 === 0 ? null : 50,
          packetLoss: i % 2 === 0 ? 100 : 0,
          status: i % 2 === 0 ? 'error' : 'success',
        },
      });
    }

    await rateLimiter.updateDeviceHealth(deviceId);

    const health = rateLimiter.getDeviceHealth(deviceId);
    expect(health?.errorRate).toBeGreaterThan(0.4);

    const shouldSkipBackup = rateLimiter.shouldSkipOperation(deviceId, 'backup');
    expect(shouldSkipBackup).toBe(true);
  });

  it('should reset device baseline', async () => {
    const deviceId = 'reset-device';

    await rateLimiter.updateDeviceHealth(deviceId);
    rateLimiter.resetDeviceBaseline(deviceId);

    const config = rateLimiter.getRateLimitConfig(deviceId);
    expect(config.icmpInterval).toBe(60000);
  });
});
