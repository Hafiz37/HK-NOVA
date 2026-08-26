import { NextResponse } from 'next/server';
import { getRoleHierarchy, getEffectivePermissions, createRole, assignUserRole } from '@/lib/rbac/role-hierarchy';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const hierarchy = await getRoleHierarchy();
    return NextResponse.json({ ok: true, hierarchy });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, displayName, description, parentId, permissions, inheritsParent } = body;

    if (!name || !displayName) {
      return NextResponse.json({ ok: false, error: 'Name and displayName are required' }, { status: 400 });
    }

    const role = await createRole({ name, displayName, description, parentId, permissions, inheritsParent });
    return NextResponse.json({ ok: true, role }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}