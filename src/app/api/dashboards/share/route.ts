import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboards/share
 * Generates a read-only share token for public dashboard access.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.setting.upsert({
      where: { key: `share_token:${token}` },
      update: { value: { expiresAt: expiresAt.toISOString(), createdBy: auth.user.username } },
      create: {
        key: `share_token:${token}`,
        value: { expiresAt: expiresAt.toISOString(), createdBy: auth.user.username },
      },
    });

    const origin = request.nextUrl.origin;
    const shareUrl = `${origin}/public-dashboard/${token}`;

    return NextResponse.json({ token, shareUrl, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error('[API /api/dashboards/share POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 });
  }
}

/**
 * GET /api/dashboards/share?token=xyz
 * Validates a share token.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: `share_token:${token}` },
    });

    if (!setting) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 });
    }

    const { expiresAt } = setting.value as { expiresAt: string };
    if (new Date(expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }

    return NextResponse.json({ valid: true, token });
  } catch (error) {
    console.error('[API /api/dashboards/share GET] Error:', error);
    return NextResponse.json({ error: 'Failed to validate token' }, { status: 500 });
  }
}