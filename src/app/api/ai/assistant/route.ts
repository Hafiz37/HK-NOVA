import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseNaturalLanguage, executeQuery, EXAMPLE_QUERIES } from '@/lib/ai/assistant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/assistant
 * Process natural language query and return results
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { query, context } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const parsed = parseNaturalLanguage(query);
    const result = await executeQuery(parsed, auth.user.id);

    return NextResponse.json({
      query,
      parsed,
      result,
      examples: EXAMPLE_QUERIES,
    });
  } catch (error) {
    console.error('[API /api/ai/assistant] Error:', error);
    return NextResponse.json({ error: 'Failed to process query' }, { status: 500 });
  }
}

/**
 * GET /api/ai/assistant
 * Get example queries
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    examples: EXAMPLE_QUERIES,
    intents: [
      { name: 'devices', description: 'List or filter devices' },
      { name: 'metrics', description: 'Show metrics charts for a device' },
      { name: 'alerts', description: 'List or filter alerts' },
      { name: 'forecast', description: 'Capacity planning forecasts' },
      { name: 'summary', description: 'System overview' },
    ],
    entities: [
      { name: 'deviceName', example: 'router-core-1' },
      { name: 'deviceIp', example: '10.0.0.1' },
      { name: 'metric', examples: ['latency', 'cpu', 'memory', 'bandwidth'] },
      { name: 'timeRange', examples: ['last 6 hours', 'past 24h', 'last 7 days'] },
      { name: 'status', examples: ['UP', 'DOWN'] },
      { name: 'severity', examples: ['CRITICAL', 'HIGH'] },
    ],
  });
}