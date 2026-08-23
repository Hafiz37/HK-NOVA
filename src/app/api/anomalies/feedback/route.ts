import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession, requireRole } from '@/lib/auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { anomalyId, feedback, comment, tags } = body;

    if (!anomalyId || !feedback) {
      return NextResponse.json({ error: 'anomalyId and feedback are required' }, { status: 400 });
    }

    const validFeedback = ['TRUE_POSITIVE', 'FALSE_POSITIVE', 'UNKNOWN', 'EXPECTED_BEHAVIOR'];
    if (!validFeedback.includes(feedback)) {
      return NextResponse.json({ error: 'Invalid feedback type' }, { status: 400 });
    }

    // Check if anomaly exists
    const anomaly = await prisma.anomaly.findUnique({ where: { id: anomalyId } });
    if (!anomaly) {
      return NextResponse.json({ error: 'Anomaly not found' }, { status: 404 });
    }

    // Check if feedback already exists
    const existing = await prisma.anomalyFeedback.findUnique({ where: { anomalyId } });
    if (existing) {
      return NextResponse.json({ error: 'Feedback already exists for this anomaly' }, { status: 409 });
    }

    const feedbackRecord = await prisma.anomalyFeedback.create({
      data: {
        anomalyId,
        feedback: feedback as 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'UNKNOWN' | 'EXPECTED_BEHAVIOR',
        userId: auth.user.id,
        comment,
        tags: tags ?? [],
      },
    });

    return NextResponse.json({
      success: true,
      data: feedbackRecord,
    });
  } catch (err) {
    console.error('[API /api/anomalies/feedback POST] Error:', err);
    return NextResponse.json({ error: 'Gagal menyimpan feedback' }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const anomalyId = searchParams.get('anomalyId');

    if (anomalyId) {
      const feedback = await prisma.anomalyFeedback.findUnique({
        where: { anomalyId },
        include: { user: { select: { id: true, username: true, fullName: true } } },
      });
      return NextResponse.json({ data: feedback });
    }

    const feedbacks = await prisma.anomalyFeedback.findMany({
      include: {
        anomaly: { select: { id: true, deviceId: true, metricType: true, severity: true, timestamp: true } },
        user: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ data: feedbacks });
  } catch (err) {
    console.error('[API /api/anomalies/feedback GET] Error:', err);
    return NextResponse.json({ error: 'Gagal mengambil feedback' }, { status: 500 });
  }
}