import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  success: boolean;
  metadata?: Record<string, any>;
}

interface AggregatedMetrics {
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p95: number;
  p99: number;
  successRate: number;
}

class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 10000;
  private aggregationInterval = 60_000; // 1 minute
  private aggregationTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    this.startAggregation();
  }
  
  startTimer(name: string): (success?: boolean, metadata?: Record<string, any>) => void {
    const start = performance.now();
    
    return (success = true, metadata?: Record<string, any>) => {
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        duration,
        timestamp: Date.now(),
        success,
        metadata,
      });
    };
  }
  
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = performance.now();
    let success = true;
    
    try {
      const result = await fn();
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        duration,
        timestamp: Date.now(),
        success,
        metadata,
      });
    }
  }
  
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    
    this.emit('metric', metric);
    
    // Alert on slow operations
    if (metric.duration > 5000) {
      this.emit('slow-operation', metric);
    }
  }
  
  getMetrics(name?: string, since?: number): PerformanceMetric[] {
    let filtered = this.metrics;
    
    if (name) {
      filtered = filtered.filter(m => m.name === name);
    }
    
    if (since) {
      filtered = filtered.filter(m => m.timestamp >= since);
    }
    
    return filtered;
  }
  
  getAggregatedMetrics(name: string, timeWindowMs?: number): AggregatedMetrics | null {
    const since = timeWindowMs ? Date.now() - timeWindowMs : undefined;
    const metrics = this.getMetrics(name, since);
    
    if (metrics.length === 0) {
      return null;
    }
    
    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const successCount = metrics.filter(m => m.success).length;
    
    return {
      count: metrics.length,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p50: this.percentile(durations, 50),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
      successRate: successCount / metrics.length,
    };
  }
  
  getAllAggregatedMetrics(timeWindowMs?: number): Record<string, AggregatedMetrics> {
    const metricNames = [...new Set(this.metrics.map(m => m.name))];
    const result: Record<string, AggregatedMetrics> = {};
    
    for (const name of metricNames) {
      const aggregated = this.getAggregatedMetrics(name, timeWindowMs);
      if (aggregated) {
        result[name] = aggregated;
      }
    }
    
    return result;
  }
  
  getSlowOperations(thresholdMs = 2000, limit = 50): PerformanceMetric[] {
    return this.metrics
      .filter(m => m.duration > thresholdMs)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }
  
  getFailedOperations(limit = 50): PerformanceMetric[] {
    return this.metrics
      .filter(m => !m.success)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  
  clear(): void {
    this.metrics = [];
  }
  
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((sorted.length * p) / 100) - 1;
    return sorted[Math.max(0, index)];
  }
  
  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      const aggregated = this.getAllAggregatedMetrics(this.aggregationInterval);
      this.emit('aggregation', aggregated);
      
      // Clean up old metrics
      const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
      this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
    }, this.aggregationInterval);
  }
  
  stop(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Convenience functions
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  return performanceMonitor.measure(name, fn, metadata);
}

export function measureSync<T>(
  name: string,
  fn: () => T,
  metadata?: Record<string, any>
): T {
  const endTimer = performanceMonitor.startTimer(name);
  let success = true;
  
  try {
    const result = fn();
    endTimer(success, metadata);
    return result;
  } catch (error) {
    success = false;
    endTimer(success, metadata);
    throw error;
  }
}

// Performance decorator
export function Measure(metricName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const name = metricName || `${target.constructor.name}.${propertyKey}`;
    
    descriptor.value = async function (...args: any[]) {
      return measureAsync(name, () => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}

// Log slow operations
performanceMonitor.on('slow-operation', (metric) => {
  console.warn(
    `⚠️  Slow operation detected: ${metric.name} took ${metric.duration.toFixed(2)}ms`,
    metric.metadata
  );
});

// Export aggregated metrics for Prometheus
export function getPrometheusMetrics(): string {
  const aggregated = performanceMonitor.getAllAggregatedMetrics();
  let output = '';
  
  for (const [name, metrics] of Object.entries(aggregated)) {
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    
    output += `# HELP ${safeName}_duration_seconds Operation duration\n`;
    output += `# TYPE ${safeName}_duration_seconds summary\n`;
    output += `${safeName}_duration_seconds{quantile="0.5"} ${(metrics.p50 / 1000).toFixed(6)}\n`;
    output += `${safeName}_duration_seconds{quantile="0.95"} ${(metrics.p95 / 1000).toFixed(6)}\n`;
    output += `${safeName}_duration_seconds{quantile="0.99"} ${(metrics.p99 / 1000).toFixed(6)}\n`;
    output += `${safeName}_duration_seconds_sum ${(metrics.totalDuration / 1000).toFixed(6)}\n`;
    output += `${safeName}_duration_seconds_count ${metrics.count}\n`;
    output += `\n`;
    
    output += `# HELP ${safeName}_success_rate Operation success rate\n`;
    output += `# TYPE ${safeName}_success_rate gauge\n`;
    output += `${safeName}_success_rate ${metrics.successRate.toFixed(4)}\n`;
    output += `\n`;
  }
  
  return output;
}
