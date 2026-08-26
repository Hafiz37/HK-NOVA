import { NextResponse } from 'next/server';
import { getEffectivePermissions } from '@/lib/rbac/role-hierarchy';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const permissions = await getEffectivePermissions(id);
    return NextResponse.json({ ok: true, permissions });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}