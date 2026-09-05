import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { 
  DatabaseHealthCheck, 
  MemoryHealthCheck, 
  CircuitBreakerHealthCheck,
  HealthStatus,
  HealthCheckRegistry 
} from '@/lib/health-check';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(),
}));

describe('Health Checks', () => {
  describe('DatabaseHealthCheck', () => {
    it('should return HEALTHY when database responds quickly', async () => {
      const mockPrisma = {
        $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
      } as any;

      const check = new DatabaseHealthCheck(mockPrisma);
      const result = await check.check();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.component).toBe('database');
      expect(result.responseTimeMs).toBeLessThan(1000);
    });

    it('should return UNHEALTHY when database is down', async () => {
      const mockPrisma = {
        $queryRaw: vi.fn().mockRejectedValue(new Error('Connection refused')),
      } as any;

      const check = new DatabaseHealthCheck(mockPrisma);
      const result = await check.check();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('MemoryHealthCheck', () => {
    it('should return HEALTHY when memory usage is low', async () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn().mockReturnValue({
        heapUsed: 50 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        rss: 150 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      const check = new MemoryHealthCheck();
      const result = await check.check();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details?.heapUsedPercent).toBe(50);

      process.memoryUsage = originalMemoryUsage;
    });

    it('should return DEGRADED when memory usage is high', async () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn().mockReturnValue({
        heapUsed: 80 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        rss: 150 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      const check = new MemoryHealthCheck();
      const result = await check.check();

      expect(result.status).toBe(HealthStatus.DEGRADED);

      process.memoryUsage = originalMemoryUsage;
    });

    it('should return UNHEALTHY when memory usage is critical', async () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn().mockReturnValue({
        heapUsed: 95 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        rss: 150 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      const check = new MemoryHealthCheck();
      const result = await check.check();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);

      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('HealthCheckRegistry', () => {
    it('should run all registered checks', async () => {
      const registry = new HealthCheckRegistry();
      
      const mockCheck1 = {
        check: vi.fn().mockResolvedValue({
          status: HealthStatus.HEALTHY,
          component: 'test1',
          responseTimeMs: 10,
          timestamp: Date.now(),
        }),
      };

      const mockCheck2 = {
        check: vi.fn().mockResolvedValue({
          status: HealthStatus.HEALTHY,
          component: 'test2',
          responseTimeMs: 20,
          timestamp: Date.now(),
        }),
      };

      registry.register(mockCheck1 as any);
      registry.register(mockCheck2 as any);

      const result = await registry.runAll();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.checks).toHaveLength(2);
      expect(mockCheck1.check).toHaveBeenCalledTimes(1);
      expect(mockCheck2.check).toHaveBeenCalledTimes(1);
    });

    it('should return DEGRADED when any check is degraded', async () => {
      const registry = new HealthCheckRegistry();
      
      const mockCheck1 = {
        check: vi.fn().mockResolvedValue({
          status: HealthStatus.HEALTHY,
          component: 'test1',
          responseTimeMs: 10,
          timestamp: Date.now(),
        }),
      };

      const mockCheck2 = {
        check: vi.fn().mockResolvedValue({
          status: HealthStatus.DEGRADED,
          component: 'test2',
          responseTimeMs: 20,
          timestamp: Date.now(),
        }),
      };

      registry.register(mockCheck1 as any);
      registry.register(mockCheck2 as any);

      const result = await registry.runAll();

      expect(result.status).toBe(HealthStatus.DEGRADED);
    });

    it('should return UNHEALTHY when any check is unhealthy', async () => {
      const registry = new HealthCheckRegistry();
      
      const mockCheck1 = {
        check: vi.fn().mockResolvedValue({
          status: HealthStatus.HEALTHY,
          component: 'test1',
          responseTimeMs: 10,
          timestamp: Date.now(),
        }),
      };

      const mockCheck2 = {
        check: vi.fn().mockResolvedValue({
          status: HealthStatus.UNHEALTHY,
          component: 'test2',
          responseTimeMs: 0,
          error: 'Service down',
          timestamp: Date.now(),
        }),
      };

      registry.register(mockCheck1 as any);
      registry.register(mockCheck2 as any);

      const result = await registry.runAll();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });
  });
});
