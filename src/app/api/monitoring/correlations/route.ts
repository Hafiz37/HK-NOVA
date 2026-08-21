import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import {
  analyzeCorrelations,
  findRootCauseCandidates,
  buildDependencyMap,
} from '@/lib/correlation';
import { parsePositiveIntParam, parsePositiveNumberParam } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/monitoring/correlations?deviceId=xyz&windowHours=24
 * Returns cross-metric correlation analysis for a device or all devices.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId') || undefined;
    const windowHours = parsePositiveNumberParam(searchParams.get('hours'), 24, 1, 168);
    const minSamples = parsePositiveIntParam(searchParams.get('minSamples'), 30, 10, 100);
    const type = searchParams.get('type') || 'correlations'; // 'correlations' | 'root-cause' | 'dependency-map'

    if (type === 'root-cause') {
      const alertMetric = searchParams.get('metric') || 'cpu';
      const alertTimeParam = searchParams.get('time');
      const alertTimestamp = alertTimeParam ? new Date(alertTimeParam) : new Date();

      if (deviceId) {
        const candidates = await findRootCauseCandidates(deviceId, alertMetric, alertTimestamp, 2);
        return NextResponse.json({ deviceId, alertMetric, timestamp: alertTimestamp, candidates });
      }
      return NextResponse.json({ error: 'deviceId required for root-cause analysis' }, { status: 400 });
    }

    if (type === 'dependency-map') {
      const { nodes, edges } = await buildDependencyMap(windowHours);
      return NextResponse.json({ nodes, edges, windowHours });
    }

    const correlations = await analyzeCorrelations({ deviceId, windowHours, minSamples });
    return NextResponse.json({
      deviceId,
      windowHours,
      minSamples,
      correlations,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /api/monitoring/correlations] Error:', error);
    return NextResponse.json({ error: 'Failed to compute correlations' }, { status: 500 });
  }
}