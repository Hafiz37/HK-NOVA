import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { revokeApiKey, rotateApiKey } from '@/lib/api-key/manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN, UserRole.OPERATOR]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        resourceFilters: true,
        rateLimit: true,
        allowedIps: true,
        isActive: true,
        lastUsedAt: true,
        usageCount: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
        revokedBy: true,
        revokedReason: true,
      },
    });

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    // Check ownership (unless admin)
    if (apiKey.userId !== auth.user.id && auth.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ data: apiKey });
  } catch (error) {
    console.error('[API /api/api-keys/[id] GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch API key' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN, UserRole.OPERATOR]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || 'revoked_by_user';

    const apiKey = await prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    // Check ownership (unless admin)
    if (apiKey.userId !== auth.user.id && auth.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await revokeApiKey(id, reason, auth.user.username || 'unknown');

    return NextResponse.json({ message: 'API key revoked successfully' });
  } catch (error) {
    console.error('[API /api/api-keys/[id] DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN, UserRole.OPERATOR]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body; // 'rotate'

    const apiKey = await prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    // Check ownership (unless admin)
    if (apiKey.userId !== auth.user.id && auth.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (action === 'rotate') {
      const result = await rotateApiKey(id);
      if (!result) {
        return NextResponse.json({ error: 'Failed to rotate API key' }, { status: 500 });
      }

      return NextResponse.json({
        data: {
          ...result.keyInfo,
          key: result.key,
        },
        message: 'API key rotated. Save the new key now!',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[API /api/api-keys/[id] PUT] Error:', error);
    return NextResponse.json({ error: 'Failed to update API key' }, { status: 500 });
  }
}