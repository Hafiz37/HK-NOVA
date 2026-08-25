import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { getUserPermissions, invalidatePermissions } from '@/lib/rbac/permission-engine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { userId } = await params;
    const permissions = await getUserPermissions(userId);

    return NextResponse.json({
      data: {
        rolePermissions: permissions.rolePermissions,
        resourcePermissions: Object.fromEntries(permissions.resourcePermissions),
        groupPermissions: permissions.groupPermissions,
        attributePermissions: Object.fromEntries(permissions.attributePermissions),
      },
    });
  } catch (error) {
    console.error('[API /api/permissions/user/[userId] GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch user permissions' }, { status: 500 });
  }
}