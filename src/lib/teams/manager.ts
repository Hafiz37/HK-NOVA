import { prisma } from '@/lib/prisma';

/**
 * Create a new team
 */
export async function createTeam(input: {
  name: string;
  description?: string;
  parentId?: string;
  defaultRole?: string;
  permissions?: string[];
}) {
  return prisma.team.create({
    data: {
      name: input.name,
      description: input.description,
      parentId: input.parentId,
      defaultRole: input.defaultRole,
      permissions: input.permissions || [],
    },
  });
}

/**
 * Add user to team
 */
export async function addTeamMember(teamId: string, userId: string, roleInTeam: string = 'member', addedBy: string) {
  return prisma.teamMember.create({
    data: {
      teamId,
      userId,
      roleInTeam,
      addedBy,
    },
  });
}

/**
 * Remove user from team
 */
export async function removeTeamMember(teamId: string, userId: string) {
  return prisma.teamMember.delete({
    where: {
      teamId_userId: { teamId, userId },
    },
  });
}

/**
 * Get all teams for a user
 */
export async function getUserTeams(userId: string) {
  return prisma.teamMember.findMany({
    where: { userId },
    include: { team: { include: { parent: true } } },
  });
}

/**
 * Get team members
 */
export async function getTeamMembers(teamId: string) {
  return prisma.teamMember.findMany({
    where: { teamId },
    include: { user: { select: { id: true, username: true, email: true, fullName: true, role: true } } },
  });
}

/**
 * Get effective permissions for a team (own + inherited from parent teams)
 */
export async function getTeamPermissions(teamId: string): Promise<string[]> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { parent: true },
  });

  if (!team) return [];

  const ownPermissions = (team.permissions as string[]) || [];

  if (!team.parent) return ownPermissions;

  const parentPermissions = await getTeamPermissions(team.parent.id);
  return Array.from(new Set([...parentPermissions, ...ownPermissions]));
}

/**
 * Grant team access to a specific resource
 */
export async function grantTeamResource(input: {
  teamId: string;
  resourceType: string;
  resourceId: string;
  permissions: string[];
  grantedBy: string;
}) {
  return prisma.teamResourcePermission.upsert({
    where: {
      teamId_resourceType_resourceId: {
        teamId: input.teamId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
    },
    create: {
      teamId: input.teamId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      permissions: input.permissions,
      grantedBy: input.grantedBy,
    },
    update: {
      permissions: input.permissions,
      grantedBy: input.grantedBy,
    },
  });
}

/**
 * Get team's resource permissions
 */
export async function getTeamResourcePermissions(teamId: string) {
  return prisma.teamResourcePermission.findMany({
    where: { teamId },
  });
}