import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import {
  createAnnotation,
  getAnnotations,
  addComment,
  getComments,
  type Annotation,
  type Comment,
} from '@/lib/annotations';
import { parsePositiveIntParam, parsePositiveNumberParam } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/annotations?deviceId=xyz&hours=24&type=INCIDENT
 * Get annotations for device/time range
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId') || undefined;
    const hours = parsePositiveNumberParam(searchParams.get('hours'), 24, 1, 168);
    const type = searchParams.get('type') as Annotation['type'] | undefined;
    const limit = parsePositiveIntParam(searchParams.get('limit'), 100, 1, 500);
    const annotationId = searchParams.get('annotationId');

    if (annotationId) {
      // Get single annotation with comments
      const annotations = await getAnnotations({ deviceId, limit: 1 });
      const annotation = annotations.find((a) => a.id === annotationId);
      if (!annotation) {
        return NextResponse.json({ error: 'Annotation not found' }, { status: 404 });
      }
      const comments = await getComments(annotationId);
      return NextResponse.json({ annotation, comments });
    }

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const annotations = await getAnnotations({ deviceId, startTime: since, type, limit });

    return NextResponse.json({ annotations, count: annotations.length });
  } catch (error) {
    console.error('[API /api/annotations] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch annotations' }, { status: 500 });
  }
}

/**
 * POST /api/annotations
 * Create new annotation
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { deviceId, timestamp, type, title, description, severity, tags } = body;

    if (!timestamp || !type || !title) {
      return NextResponse.json(
        { error: 'timestamp, type, and title are required' },
        { status: 400 }
      );
    }

    const annotation = await createAnnotation(auth.user.id, auth.user.fullName || auth.user.username, {
      deviceId,
      timestamp: new Date(timestamp),
      type,
      title,
      description,
      severity,
      tags,
    });

    return NextResponse.json({ annotation }, { status: 201 });
  } catch (error) {
    console.error('[API /api/annotations POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create annotation' }, { status: 500 });
  }
}

/**
 * POST /api/annotations/comment
 * Add comment to annotation
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { annotationId, content } = body;

    if (!annotationId || !content) {
      return NextResponse.json(
        { error: 'annotationId and content are required' },
        { status: 400 }
      );
    }

    const comment = await addComment(annotationId, auth.user.id, auth.user.fullName || auth.user.username, content);

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error('[API /api/annotations PUT] Error:', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}