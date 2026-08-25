import { NextRequest, NextResponse } from 'next/server';
import { checkPermission } from './permission-engine';
import { requireSession } from '@/lib/auth';

export function requirePermission(action: string, resourceType: string) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const resourceId = request.nextUrl.pathname.split('/').pop() || undefined;
    const result = await checkPermission(auth.user.id, action, resourceType, resourceId);

    if (!result.allowed) {
      return NextResponse.json(
        { error: `Forbidden: insufficient permissions for ${resourceType}:${action}` },
        { status: 403 }
      );
    }

    return null;
  };
}

export function requireAnyPermission(permissions: Array<{ action: string; resourceType: string }>) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const resourceId = request.nextUrl.pathname.split('/').pop() || undefined;

    for (const perm of permissions) {
      const result = await checkPermission(auth.user.id, perm.action, perm.resourceType, resourceId);
      if (result.allowed) return null;
    }

    return NextResponse.json(
      { error: `Forbidden: none of the required permissions granted` },
      { status: 403 }
    );
  };
}