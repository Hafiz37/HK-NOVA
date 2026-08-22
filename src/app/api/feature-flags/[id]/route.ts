import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';

/**
 * GET /api/feature-flags/:id
 * Get a single feature flag
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const flag = await prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) {
      return NextResponse.json({ error: 'Feature flag not found' }, { status: 404 });
    }
    return NextResponse.json({ data: flag });
  } catch (error) {
    console.error('[API /api/feature-flags/:id GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch feature flag' }, { status: 500 });
  }
}

/**
 * PUT /api/feature-flags/:id
 * Update a feature flag
 * Body: { enabled?, description?, scope?, metadata? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa objek' }, { status: 400 });
    }

    const existing = await prisma.featureFlag.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Feature flag not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { updatedBy: auth.user.id };
    if (body.enabled !== undefined) updateData.enabled = body.enabled === true;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.scope !== undefined) updateData.scope = body.scope;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    const flag = await prisma.featureFlag.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ data: flag, message: 'Feature flag berhasil diupdate' });
  } catch (error) {
    console.error('[API /api/feature-flags/:id PUT] Error:', error);
    return NextResponse.json({ error: 'Failed to update feature flag' }, { status: 500 });
  }
}

/**
 * DELETE /api/feature-flags/:id
 * Delete a feature flag
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const existing = await prisma.featureFlag.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Feature flag not found' }, { status: 404 });
    }

    await prisma.featureFlag.delete({ where: { id } });
    return NextResponse.json({ message: 'Feature flag berhasil dihapus' });
  } catch (error) {
    console.error('[API /api/feature-flags/:id DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete feature flag' }, { status: 500 });
  }
}