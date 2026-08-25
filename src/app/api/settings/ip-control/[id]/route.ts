import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const rule = await prisma.ipAccessControl.findUnique({ where: { id } });

    if (!rule) {
      return NextResponse.json({ error: 'IP access rule not found' }, { status: 404 });
    }

    return NextResponse.json({ data: rule });
  } catch (error) {
    console.error('[API /api/settings/ip-control/[id] GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch IP access rule' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();

    const rule = await prisma.ipAccessControl.update({
      where: { id },
      data: {
        type: body.type,
        scope: body.scope,
        userId: body.userId,
        role: body.role,
        ipAddress: body.ipAddress,
        ipCidr: body.ipCidr,
        ipRange: body.ipRange as any,
        allowedCountries: body.allowedCountries,
        blockedCountries: body.blockedCountries,
        blockVpn: body.blockVpn,
        blockProxy: body.blockProxy,
        blockTor: body.blockTor,
        description: body.description,
        isActive: body.isActive,
        priority: body.priority,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ data: rule });
  } catch (error) {
    console.error('[API /api/settings/ip-control/[id] PUT] Error:', error);
    return NextResponse.json({ error: 'Failed to update IP access rule' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    await prisma.ipAccessControl.delete({ where: { id } });

    return NextResponse.json({ message: 'IP access rule deleted' });
  } catch (error) {
    console.error('[API /api/settings/ip-control/[id] DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete IP access rule' }, { status: 500 });
  }
}