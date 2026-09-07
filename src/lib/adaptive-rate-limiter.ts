import { PrismaClient } from '@prisma/client';

interface DeviceHealthMetrics {
  deviceId: string;
  avgResponseTime: number;
  cpuUsage: number | null;
  memoryUsage: number | null;
  errorRate: number;
  lastCheckedAt: number;
}

interface RateLimitConfig {
  icmpInterval: number;
  snmpInterval: number;
  backupEnabled: boolean;
}

class AdaptiveRateLimiter {
  private healthCache: Map<string, DeviceHealthMetrics> = new Map();
  private rateLimitConfig: Map<string, RateLimitConfig> = new Map();
  private baselineMetrics: Map<string, number> = new Map();

  private readonly DEFAULT_ICMP_INTERVAL = 60000;
  private readonly DEFAULT_SNMP_INTERVAL = 300000;
  private readonly RESPONSE_TIME_MULTIPLIER = 2.0;
  private readonly CPU_THRESHOLD = 80;
  private readonly ERROR_RATE_THRESHOLD = 0.1;

  constructor(private prisma: PrismaClient) {
    this.startHealthMonitor();
  }

  async updateDeviceHealth(deviceId: string): Promise<void> {
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);

    const recentMetrics = await this.prisma.metric.findMany({
      where: {
        deviceId,
        timestamp: { gte: fiveMinutesAgo },
      },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });

    if (recentMetrics.length === 0) {
      return;
    }

    const icmpMetrics = recentMetrics.filter(m => m.metricType === 'icmp');
    const avgResponseTime = icmpMetrics.length > 0
      ? icmpMetrics.reduce((sum, m) => sum + (m.latency || 0), 0) / icmpMetrics.length
      : 0;

    const snmpMetrics = recentMetrics.filter(m => m.metricType === 'snmp');
    const latestSnmp = snmpMetrics[0];
    
    const cpuUsage = latestSnmp?.cpuUsage || null;
    const memoryUsage = latestSnmp?.memoryUsage || null;

    const totalOps = recentMetrics.length;
    const errorOps = recentMetrics.filter(m => m.status === 'error').length;
    const errorRate = totalOps > 0 ? errorOps / totalOps : 0;

    const healthMetrics: DeviceHealthMetrics = {
      deviceId,
      avgResponseTime,
      cpuUsage,
      memoryUsage,
      errorRate,
      lastCheckedAt: now,
    };

    this.healthCache.set(deviceId, healthMetrics);

    if (!this.baselineMetrics.has(deviceId) && avgResponseTime > 0) {
      this.baselineMetrics.set(deviceId, avgResponseTime);
    }

    this.adjustRateLimit(deviceId, healthMetrics);
  }

  private adjustRateLimit(deviceId: string, health: DeviceHealthMetrics): void {
    const baseline = this.baselineMetrics.get(deviceId) || health.avgResponseTime;
    
    let icmpInterval = this.DEFAULT_ICMP_INTERVAL;
    let snmpInterval = this.DEFAULT_SNMP_INTERVAL;
    let backupEnabled = true;

    if (health.avgResponseTime > baseline * this.RESPONSE_TIME_MULTIPLIER) {
      icmpInterval = this.DEFAULT_ICMP_INTERVAL * 2;
      snmpInterval = this.DEFAULT_SNMP_INTERVAL * 1.5;
      
      console.log(`[AdaptiveRateLimit] Device ${deviceId}: High latency detected (${health.avgResponseTime.toFixed(2)}ms vs baseline ${baseline.toFixed(2)}ms) - slowing down polling`);
    }

    if (health.cpuUsage !== null && health.cpuUsage > this.CPU_THRESHOLD) {
      icmpInterval = Math.max(icmpInterval, this.DEFAULT_ICMP_INTERVAL * 3);
      snmpInterval = Math.max(snmpInterval, this.DEFAULT_SNMP_INTERVAL * 2);
      backupEnabled = false;
      
      console.log(`[AdaptiveRateLimit] Device ${deviceId}: High CPU usage (${health.cpuUsage.toFixed(1)}%) - reducing operations`);
    }

    if (health.errorRate > this.ERROR_RATE_THRESHOLD) {
      icmpInterval = Math.max(icmpInterval, this.DEFAULT_ICMP_INTERVAL * 2);
      snmpInterval = Math.max(snmpInterval, this.DEFAULT_SNMP_INTERVAL * 2);
      backupEnabled = false;
      
      console.log(`[AdaptiveRateLimit] Device ${deviceId}: High error rate (${(health.errorRate * 100).toFixed(1)}%) - backing off`);
    }

    const config: RateLimitConfig = {
      icmpInterval,
      snmpInterval,
      backupEnabled,
    };

    this.rateLimitConfig.set(deviceId, config);
  }

  getRateLimitConfig(deviceId: string): RateLimitConfig {
    return this.rateLimitConfig.get(deviceId) || {
      icmpInterval: this.DEFAULT_ICMP_INTERVAL,
      snmpInterval: this.DEFAULT_SNMP_INTERVAL,
      backupEnabled: true,
    };
  }

  shouldSkipOperation(deviceId: string, operationType: 'icmp' | 'snmp' | 'backup'): boolean {
    const config = this.getRateLimitConfig(deviceId);
    
    if (operationType === 'backup' && !config.backupEnabled) {
      return true;
    }

    const health = this.healthCache.get(deviceId);
    if (!health) {
      return false;
    }

    if (health.cpuUsage !== null && health.cpuUsage > 90) {
      return true;
    }

    if (health.errorRate > 0.5) {
      return true;
    }

    return false;
  }

  getDeviceHealth(deviceId: string): DeviceHealthMetrics | null {
    return this.healthCache.get(deviceId) || null;
  }

  getAllHealthMetrics(): Map<string, DeviceHealthMetrics> {
    return this.healthCache;
  }

  resetDeviceBaseline(deviceId: string): void {
    this.baselineMetrics.delete(deviceId);
    this.rateLimitConfig.delete(deviceId);
    console.log(`[AdaptiveRateLimit] Reset baseline for device ${deviceId}`);
  }

  private startHealthMonitor(): void {
    setInterval(async () => {
      const now = Date.now();
      const staleThreshold = 600_000;

      for (const [deviceId, health] of this.healthCache.entries()) {
        if (now - health.lastCheckedAt > staleThreshold) {
          this.healthCache.delete(deviceId);
        }
      }

      const activeDevices = await this.prisma.device.findMany({
        where: {
          deletedAt: null,
          isDemo: false,
          status: { in: ['online', 'warning'] },
        },
        select: { id: true },
        take: 50,
      });

      for (const device of activeDevices) {
        try {
          await this.updateDeviceHealth(device.id);
        } catch (err) {
          console.error(`[AdaptiveRateLimit] Failed to update health for ${device.id}:`, err);
        }
      }
    }, 120_000);
  }

  async shutdown(): Promise<void> {
    this.healthCache.clear();
    this.rateLimitConfig.clear();
    this.baselineMetrics.clear();
  }
}

let rateLimiterInstance: AdaptiveRateLimiter | null = null;

export function initAdaptiveRateLimiter(prisma: PrismaClient): AdaptiveRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new AdaptiveRateLimiter(prisma);
  }
  return rateLimiterInstance;
}

export function getAdaptiveRateLimiter(): AdaptiveRateLimiter | null {
  return rateLimiterInstance;
}
