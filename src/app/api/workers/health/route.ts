import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAllWorkerHealth, getHealthSummary, isSystemHealthy } from '@/lib/worker-health';
import { getAllCircuitBreakerMetrics } from '@/lib/circuit-breaker';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'json';

    const workerHealth = getAllWorkerHealth();
    const healthSummary = getHealthSummary();
    const systemHealthy = isSystemHealthy();
    const circuitBreakers = getAllCircuitBreakerMetrics();

    const response = {
      status: systemHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      summary: healthSummary,
      workers: workerHealth,
      circuitBreakers,
    };

    if (format === 'prometheus') {
      const metrics: string[] = [];
      
      metrics.push('# HELP hk_nova_worker_healthy Worker health status (1=healthy, 0=unhealthy/unknown)');
      metrics.push('# TYPE hk_nova_worker_healthy gauge');
      Object.entries(workerHealth).forEach(([name, health]) => {
        const value = health.status === 'healthy' ? 1 : 0;
        metrics.push(`hk_nova_worker_healthy{worker="${name}"} ${value}`);
      });

      metrics.push('# HELP hk_nova_worker_uptime_seconds Worker uptime in seconds');
      metrics.push('# TYPE hk_nova_worker_uptime_seconds gauge');
      Object.entries(workerHealth).forEach(([name, health]) => {
        if (health.uptime) {
          metrics.push(`hk_nova_worker_uptime_seconds{worker="${name}"} ${Math.floor(health.uptime / 1000)}`);
        }
      });

      metrics.push('# HELP hk_nova_circuit_breaker_state Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)');
      metrics.push('# TYPE hk_nova_circuit_breaker_state gauge');
      Object.entries(circuitBreakers).forEach(([key, cbMetrics]) => {
        const stateValue = cbMetrics.state === 'CLOSED' ? 0 : cbMetrics.state === 'HALF_OPEN' ? 1 : 2;
        metrics.push(`hk_nova_circuit_breaker_state{key="${key}"} ${stateValue}`);
      });

      metrics.push('# HELP hk_nova_circuit_breaker_failures_total Total circuit breaker failures');
      metrics.push('# TYPE hk_nova_circuit_breaker_failures_total counter');
      Object.entries(circuitBreakers).forEach(([key, cbMetrics]) => {
        metrics.push(`hk_nova_circuit_breaker_failures_total{key="${key}"} ${cbMetrics.failures}`);
      });

      return new NextResponse(metrics.join('\n'), {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    return NextResponse.json(response, {
      status: systemHealthy ? 200 : 503,
    });
  } catch (error) {
    console.error('[API] /api/workers/health error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
