import { NextRequest, NextResponse } from 'next/server';
import { circuitBreakerRegistry } from '@/lib/circuit-breaker';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const stats = circuitBreakerRegistry.getAllStats();

  const summary = {
    totalBreakers: Object.keys(stats).length,
    byState: {
      CLOSED: 0,
      OPEN: 0,
      HALF_OPEN: 0,
    },
    details: stats,
  };

  Object.values(stats).forEach(stat => {
    summary.byState[stat.state]++;
  });

  return NextResponse.json(summary);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, breakerName } = body;

  if (action === 'reset') {
    if (breakerName) {
      const breaker = circuitBreakerRegistry.get(breakerName);
      if (!breaker) {
        return NextResponse.json(
          { error: 'Circuit breaker not found' },
          { status: 404 }
        );
      }
      breaker.reset();
      return NextResponse.json({ message: `Circuit breaker ${breakerName} reset` });
    } else {
      circuitBreakerRegistry.resetAll();
      return NextResponse.json({ message: 'All circuit breakers reset' });
    }
  }

  return NextResponse.json(
    { error: 'Invalid action' },
    { status: 400 }
  );
}
