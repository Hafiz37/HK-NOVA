import { NextRequest, NextResponse } from 'next/server';
import { healthCheckRegistry } from '@/lib/health-check';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const component = searchParams.get('component');

  try {
    if (component) {
      const result = await healthCheckRegistry.runCheck(component);
      
      if (!result) {
        return NextResponse.json(
          { error: 'Component not found' },
          { status: 404 }
        );
      }

      const statusCode = result.status === 'HEALTHY' ? 200 : 
                        result.status === 'DEGRADED' ? 200 : 503;

      return NextResponse.json(result, { status: statusCode });
    }

    const health = await healthCheckRegistry.runAll();

    const statusCode = health.status === 'HEALTHY' ? 200 :
                      health.status === 'DEGRADED' ? 200 : 503;

    return NextResponse.json(health, { status: statusCode });
  } catch (error) {
    console.error('[Health Check] Error:', error);
    
    return NextResponse.json(
      {
        status: 'UNHEALTHY',
        error: error instanceof Error ? error.message : 'Health check failed',
        timestamp: Date.now(),
      },
      { status: 503 }
    );
  }
}
