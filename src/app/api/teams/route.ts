import { NextResponse } from 'next/server';
import { createTeam, getTeamPermissions, getTeamMembers, addTeamMember, removeTeamMember, grantTeamResource, getTeamResourcePermissions } from '@/lib/teams/manager';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const teams = await prisma.team.findMany({
      where: { isActive: true },
      include: { parent: true, members: { include: { user: { select: { id: true, username: true, email: true, fullName: true } } } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ ok: true, teams });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, parentId, defaultRole, permissions } = body;

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });
    }

    const team = await createTeam({ name, description, parentId, defaultRole, permissions });
    return NextResponse.json({ ok: true, team }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}