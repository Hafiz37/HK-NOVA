import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const resource = searchParams.get('resource');
    const action = searchParams.get('action');
    const category = searchParams.get('category');

    const where: Record<string, unknown> = {};
    if (resource) where.resource = resource;
    if (action) where.action = action;
    if (category) where.category = category;

    const permissions = await prisma.permission.findMany({
      where,
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });

    return NextResponse.json({ data: permissions });
  } catch (error) {
    console.error('[API /api/permissions GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name, resource, action, description, category } = body;

    if (!name || !resource || !action) {
      return NextResponse.json({ error: 'name, resource, and action are required' }, { status: 400 });
    }

    const permission = await prisma.permission.create({
      data: { name, resource, action, description, category },
    });

    return NextResponse.json({ data: permission }, { status: 201 });
  } catch (error) {
    console.error('[API /api/permissions POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create permission' }, { status: 500 });
  }
}