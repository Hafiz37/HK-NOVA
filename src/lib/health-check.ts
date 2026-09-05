import { PrismaClient } from '@prisma/client';
import { circuitBreakerRegistry } from './circuit-breaker';

export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
}

export interface HealthCheckResult {
  status: HealthStatus;
  component: string;
  responseTimeMs: number;
  error?: string;
  details?: Record<string, any>;
  timestamp: number;
}

export interface SystemHealth {
  status: HealthStatus;
  checks: HealthCheckResult[];
  uptime: number;
  timestamp: number;
}

export abstract class HealthCheck {
  constructor(protected name: string) {}

  abstract check(): Promise<HealthCheckResult>;

  protected async measure<T>(operation: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
    const start = Date.now();
    const result = await operation();
    return { result, timeMs: Date.now() - start };
  }

  protected createResult(
    status: HealthStatus,
    responseTimeMs: number,
    error?: string,
    details?: Record<string, any>
  ): HealthCheckResult {
    return {
      status,
      component: this.name,
      responseTimeMs,
      error,
      details,
      timestamp: Date.now(),
    };
  }
}

export class DatabaseHealthCheck extends HealthCheck {
  constructor(private prisma: PrismaClient) {
    super('database');
  }

  async check(): Promise<HealthCheckResult> {
    try {
      const { timeMs } = await this.measure(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      });

      const status = timeMs < 1000 ? HealthStatus.HEALTHY : HealthStatus.DEGRADED;

      return this.createResult(status, timeMs, undefined, {
        threshold: '1000ms',
        message: timeMs >= 1000 ? 'Database response time elevated' : undefined,
      });
    } catch (error) {
      return this.createResult(
        HealthStatus.UNHEALTHY,
        0,
        error instanceof Error ? error.message : 'Database check failed'
      );
    }
  }
}

export class RedisHealthCheck extends HealthCheck {
  constructor(private redis: any) {
    super('redis');
  }

  async check(): Promise<HealthCheckResult> {
    try {
      const { timeMs } = await this.measure(async () => {
        await this.redis.ping();
      });

      const status = timeMs < 500 ? HealthStatus.HEALTHY : HealthStatus.DEGRADED;

      return this.createResult(status, timeMs, undefined, {
        threshold: '500ms',
      });
    } catch (error) {
      return this.createResult(
        HealthStatus.UNHEALTHY,
        0,
        error instanceof Error ? error.message : 'Redis check failed'
      );
    }
  }
}

export class CircuitBreakerHealthCheck extends HealthCheck {
  constructor() {
    super('circuit-breakers');
  }

  async check(): Promise<HealthCheckResult> {
    const stats = circuitBreakerRegistry.getAllStats();
    const openBreakers = Object.entries(stats).filter(
      ([_, stat]) => stat.state === 'OPEN'
    );

    let status = HealthStatus.HEALTHY;
    if (openBreakers.length > 0) {
      status = openBreakers.length > 5 ? HealthStatus.UNHEALTHY : HealthStatus.DEGRADED;
    }

    return this.createResult(status, 0, undefined, {
      totalBreakers: Object.keys(stats).length,
      openBreakers: openBreakers.length,
      openBreakerNames: openBreakers.map(([name]) => name),
    });
  }
}

export class MemoryHealthCheck extends HealthCheck {
  constructor() {
    super('memory');
  }

  async check(): Promise<HealthCheckResult> {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const heapUsedPercent = (heapUsedMB / heapTotalMB) * 100;

    let status = HealthStatus.HEALTHY;
    if (heapUsedPercent > 90) {
      status = HealthStatus.UNHEALTHY;
    } else if (heapUsedPercent > 75) {
      status = HealthStatus.DEGRADED;
    }

    return this.createResult(status, 0, undefined, {
      heapUsedMB: Math.round(heapUsedMB),
      heapTotalMB: Math.round(heapTotalMB),
      heapUsedPercent: Math.round(heapUsedPercent),
      rssMB: Math.round(usage.rss / 1024 / 1024),
    });
  }
}

export class DiskHealthCheck extends HealthCheck {
  constructor() {
    super('disk');
  }

  async check(): Promise<HealthCheckResult> {
    try {
      const { execSync } = require('child_process');
      const dfOutput = execSync("df -h / | tail -1 | awk '{print $5}'", {
        encoding: 'utf-8',
      });
      
      const usagePercent = parseInt(dfOutput.replace('%', ''));

      let status = HealthStatus.HEALTHY;
      if (usagePercent > 90) {
        status = HealthStatus.UNHEALTHY;
      } else if (usagePercent > 80) {
        status = HealthStatus.DEGRADED;
      }

      return this.createResult(status, 0, undefined, {
        usagePercent,
        threshold: { warning: 80, critical: 90 },
      });
    } catch (error) {
      return this.createResult(
        HealthStatus.DEGRADED,
        0,
        'Unable to check disk usage'
      );
    }
  }
}

export class HealthCheckRegistry {
  private checks: HealthCheck[] = [];
  private lastResults: HealthCheckResult[] = [];
  private startTime = Date.now();

  register(check: HealthCheck): void {
    this.checks.push(check);
  }

  async runAll(): Promise<SystemHealth> {
    const results = await Promise.all(
      this.checks.map(check => 
        check.check().catch(error => ({
          status: HealthStatus.UNHEALTHY,
          component: check['name'],
          responseTimeMs: 0,
          error: error instanceof Error ? error.message : 'Health check failed',
          timestamp: Date.now(),
        }))
      )
    );

    this.lastResults = results;

    const unhealthyCount = results.filter(r => r.status === HealthStatus.UNHEALTHY).length;
    const degradedCount = results.filter(r => r.status === HealthStatus.DEGRADED).length;

    let overallStatus = HealthStatus.HEALTHY;
    if (unhealthyCount > 0) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (degradedCount > 0) {
      overallStatus = HealthStatus.DEGRADED;
    }

    return {
      status: overallStatus,
      checks: results,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
    };
  }

  getLastResults(): HealthCheckResult[] {
    return this.lastResults;
  }

  async runCheck(componentName: string): Promise<HealthCheckResult | null> {
    const check = this.checks.find(c => c['name'] === componentName);
    if (!check) {
      return null;
    }
    return await check.check();
  }
}

export const healthCheckRegistry = new HealthCheckRegistry();

export function initializeHealthChecks(prisma: PrismaClient, redis?: any): void {
  healthCheckRegistry.register(new DatabaseHealthCheck(prisma));
  
  if (redis) {
    healthCheckRegistry.register(new RedisHealthCheck(redis));
  }
  
  healthCheckRegistry.register(new CircuitBreakerHealthCheck());
  healthCheckRegistry.register(new MemoryHealthCheck());
  healthCheckRegistry.register(new DiskHealthCheck());
}

export interface ErrorRecoveryStrategy {
  name: string;
  shouldRecover: (error: Error) => boolean;
  recover: (error: Error, context: any) => Promise<void>;
}

export class ErrorRecoveryManager {
  private strategies: ErrorRecoveryStrategy[] = [];

  registerStrategy(strategy: ErrorRecoveryStrategy): void {
    this.strategies.push(strategy);
  }

  async attemptRecovery(error: Error, context: any): Promise<boolean> {
    for (const strategy of this.strategies) {
      if (strategy.shouldRecover(error)) {
        try {
          console.log(`[Recovery] Attempting ${strategy.name} for error: ${error.message}`);
          await strategy.recover(error, context);
          console.log(`[Recovery] ${strategy.name} succeeded`);
          return true;
        } catch (recoveryError) {
          console.error(
            `[Recovery] ${strategy.name} failed:`,
            recoveryError instanceof Error ? recoveryError.message : recoveryError
          );
        }
      }
    }
    return false;
  }
}

export const errorRecoveryManager = new ErrorRecoveryManager();

errorRecoveryManager.registerStrategy({
  name: 'ResetCircuitBreaker',
  shouldRecover: (error: Error) => 
    error.message.includes('Circuit breaker') && error.message.includes('OPEN'),
  recover: async (error: Error, context: { deviceId?: string }) => {
    const match = error.message.match(/Circuit breaker \[(.*?)\] is OPEN/);
    if (match) {
      const breakerName = match[1];
      const breaker = circuitBreakerRegistry.get(breakerName);
      if (breaker) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        breaker.reset();
        console.log(`[Recovery] Reset circuit breaker: ${breakerName}`);
      }
    }
  },
});

errorRecoveryManager.registerStrategy({
  name: 'ReconnectSSH',
  shouldRecover: (error: Error) => {
    const msg = error.message.toLowerCase();
    return msg.includes('connection') || msg.includes('econnreset');
  },
  recover: async (error: Error, context: { deviceId?: string; sshPool?: any }) => {
    if (context.deviceId && context.sshPool) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`[Recovery] SSH pool cleanup for device: ${context.deviceId}`);
    }
  },
});

errorRecoveryManager.registerStrategy({
  name: 'DatabaseReconnect',
  shouldRecover: (error: Error) => {
    const msg = error.message.toLowerCase();
    return msg.includes('prisma') || msg.includes('connection pool');
  },
  recover: async (error: Error, context: { prisma?: PrismaClient }) => {
    if (context.prisma) {
      await context.prisma.$disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await context.prisma.$connect();
      console.log(`[Recovery] Database reconnected`);
    }
  },
});
