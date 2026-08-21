/**
 * Internal Telemetry & Platform Performance Collector
 * Records API durations, DB query latencies, and system health metrics.
 */

interface TelemetryMetric {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

class TelemetryCollector {
  private metrics: TelemetryMetric[] = [];
  private maxMetrics = 1000;

  record(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      tags,
      timestamp: Date.now(),
    });

    if (this.metrics.length > this.maxMetrics) {
      this.metrics.splice(0, this.metrics.length - this.maxMetrics);
    }
  }

  getSummary(windowMs = 300_000): {
    totalRequests: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    errorCount: number;
  } {
    const since = Date.now() - windowMs;
    const recent = this.metrics.filter((m) => m.timestamp >= since);

    if (recent.length === 0) {
      return { totalRequests: 0, avgLatencyMs: 0, p95LatencyMs: 0, errorCount: 0 };
    }

    const latencies = recent.map((m) => m.value).sort((a, b) => a - b);
    const avgLatencyMs = latencies.reduce((s, v) => s + v, 0) / latencies.length;
    const p95LatencyMs = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))];
    const errorCount = recent.filter((m) => m.tags?.status && Number(m.tags.status) >= 400).length;

    return {
      totalRequests: recent.length,
      avgLatencyMs: Number(avgLatencyMs.toFixed(2)),
      p95LatencyMs: Number(p95LatencyMs?.toFixed(2) ?? 0),
      errorCount,
    };
  }
}

export const telemetry = new TelemetryCollector();
