import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';

/**
 * GET /api/feature-flags
 * List all feature flags
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const flags = await prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });
    return NextResponse.json({ data: flags });
  } catch (error) {
    console.error('[API /api/feature-flags GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch feature flags' }, { status: 500 });
  }
}

/**
 * POST /api/feature-flags
 * Create or update a feature flag
 * Body: { key, enabled, description?, scope?, metadata? }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa objek' }, { status: 400 });
    }

    const key = typeof body.key === 'string' ? body.key.trim() : '';
    const enabled = body.enabled === true;
    const description = typeof body.description === 'string' ? body.description : undefined;
    const scope = typeof body.scope === 'string' && body.scope ? body.scope : 'GLOBAL';
    const metadata = body.metadata ?? undefined;

    if (!key) {
      return NextResponse.json({ error: 'Field key wajib diisi' }, { status: 400 });
    }

    const flag = await prisma.featureFlag.upsert({
      where: { key },
      update: {
        enabled,
        description,
        scope,
        metadata,
        updatedBy: auth.user.id,
      },
      create: {
        key,
        enabled,
        description,
        scope,
        metadata,
        updatedBy: auth.user.id,
      },
    });

    return NextResponse.json({ data: flag, message: 'Feature flag berhasil disimpan' });
  } catch (error) {
    console.error('[API /api/feature-flags POST] Error:', error);
    return NextResponse.json({ error: 'Failed to save feature flag' }, { status: 500 });
  }
}