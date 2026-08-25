import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { generateApiKey } from '@/lib/api-key/manager';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN, UserRole.OPERATOR]);
  if (!auth.ok) return auth.response;

  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId: auth.user.id },
      select: {
        id: true,
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
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ data: apiKeys });
  } catch (error) {
    console.error('[API /api/api-keys GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN, UserRole.OPERATOR]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name, scopes, resourceFilters, rateLimit, allowedIps, expiresAt } = body;

    if (!name || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json({ error: 'name and scopes (array) are required' }, { status: 400 });
    }

    const result = await generateApiKey(auth.user.id, name, scopes, {
      resourceFilters,
      rateLimit,
      allowedIps,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    // Return the full key only once!
    return NextResponse.json({
      data: {
        ...result.keyInfo,
        key: result.key, // Only returned on creation
      },
      message: 'API key created. Save the key now - it will not be shown again!',
    }, { status: 201 });
  } catch (error) {
    console.error('[API /api/api-keys POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}