import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession, requireRole } from '@/lib/auth';
import { createCorrelationEngine } from '@/lib/algorithms';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'patterns';
    const deviceId = searchParams.get('deviceId');
    const sinceHours = parseInt(searchParams.get('sinceHours') || '24');

    const engine = createCorrelationEngine(prisma);

    if (action === 'patterns') {
      const patterns = await engine.getStoredPatterns();
      return NextResponse.json({ data: patterns });
    }

    if (action === 'analyze') {
      const result = await engine.analyzeCorrelations(sinceHours);
      return NextResponse.json({ data: result });
    }

    if (action === 'graph') {
      const result = await engine.analyzeCorrelations(sinceHours);
      return NextResponse.json({ data: result.graph });
    }

    if (action === 'predict' && deviceId) {
      const anomalyId = searchParams.get('anomalyId');
      if (!anomalyId) {
        return NextResponse.json({ error: 'anomalyId required for prediction' }, { status: 400 });
      }
      const predictions = await engine.predictNextAnomalies(anomalyId);
      return NextResponse.json({ data: predictions });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[API /api/anomalies/correlations GET] Error:', err);
    return NextResponse.json({ error: 'Gagal mengambil korelasi' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'reanalyze') {
      const engine = createCorrelationEngine(prisma);
      const result = await engine.analyzeCorrelations(168); // 1 week
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[API /api/anomalies/correlations POST] Error:', err);
    return NextResponse.json({ error: 'Gagal memproses korelasi' }, { status: 500 });
  }
}