import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { parseBatchProvisioningInput, BATCH_CSV_TEMPLATE, BATCH_JSON_TEMPLATE } from '@/lib/batch-import';

/**
 * GET /api/provisioning/batch-template?format=csv|json
 * Get batch import template
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'csv';

    if (format === 'json') {
      return NextResponse.json({ data: BATCH_JSON_TEMPLATE, format: 'json' });
    }

    return NextResponse.json({ data: BATCH_CSV_TEMPLATE, format: 'csv' });
  } catch (error) {
    console.error('[API /api/provisioning/batch-template GET] Error:', error);
    return NextResponse.json({ error: 'Failed to get batch template' }, { status: 500 });
  }
}

/**
 * POST /api/provisioning/batch-template/parse
 * Parse batch import input
 * Body: { input: string, format: 'csv' | 'json' }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa objek' }, { status: 400 });
    }

    const input = typeof body.input === 'string' ? body.input : '';
    const format = body.format === 'json' ? 'json' : 'csv';

    if (!input.trim()) {
      return NextResponse.json({ error: 'Input tidak boleh kosong' }, { status: 400 });
    }

    const parsed = parseBatchProvisioningInput(input, format);

    return NextResponse.json({ data: parsed, count: parsed.length });
  } catch (error) {
    console.error('[API /api/provisioning/batch-template/parse POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Parse error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}