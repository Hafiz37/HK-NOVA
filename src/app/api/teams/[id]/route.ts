import { NextResponse } from 'next/server';
import { getTeamPermissions, getTeamMembers, addTeamMember, removeTeamMember, grantTeamResource, getTeamResourcePermissions } from '@/lib/teams/manager';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const include = url.searchParams.get('include');

    const [team, members, permissions, resourcePermissions] = await Promise.all([
      prisma.team.findUnique({ where: { id }, include: { parent: true, subTeams: true } }),
      getTeamMembers(id),
      getTeamPermissions(id),
      getTeamResourcePermissions(id),
    ]);

    if (!team) {
      return NextResponse.json({ ok: false, error: 'Team not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, team, members, permissions, resourcePermissions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, userId, roleInTeam, resourceType, resourceId, permissions, grantedBy } = body;

    if (action === 'add_member' && userId) {
      const result = await addTeamMember(id, userId, roleInTeam || 'member', grantedBy);
      return NextResponse.json({ ok: true, result });
    }

    if (action === 'grant_resource' && resourceType && resourceId && permissions) {
      const result = await grantTeamResource({ teamId: id, resourceType, resourceId, permissions, grantedBy: grantedBy || 'system' });
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    if (userId) {
      await removeTeamMember(id, userId);
      return NextResponse.json({ ok: true, message: 'Member removed' });
    }

    return NextResponse.json({ ok: false, error: 'userId required for delete' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}