import { prisma } from '@/lib/prisma';
import type { UserRole } from '@prisma/client';

/**
 * Get role hierarchy as a tree structure
 */
export async function getRoleHierarchy() {
  const roles = await prisma.role.findMany({
    where: { isActive: true },
    include: {
      children: { where: { isActive: true } },
    },
    orderBy: { level: 'asc' },
  });

  return buildRoleTree(roles);
}

function buildRoleTree(roles: any[]) {
  const roleMap = new Map(roles.map(r => [r.id, { ...r, children: [] }]));
  const roots: any[] = [];

  for (const role of roles) {
    if (role.parentId && roleMap.has(role.parentId)) {
      roleMap.get(role.parentId)!.children.push(roleMap.get(role.id)!);
    } else {
      roots.push(roleMap.get(role.id)!);
    }
  }

  return roots;
}

/**
 * Get effective permissions for a role (including inherited from parent)
 */
export async function getEffectivePermissions(roleId: string): Promise<string[]> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { parent: true },
  });

  if (!role) return [];

  const ownPermissions = (role.permissions as string[]) || [];
  
  if (!role.inheritsParent || !role.parent) {
    return ownPermissions;
  }

  const parentPermissions = await getEffectivePermissions(role.parent.id);
  return Array.from(new Set([...parentPermissions, ...ownPermissions]));
}

/**
 * Check if a role is an ancestor of another role
 */
export async function isRoleAncestor(roleId: string, ancestorId: string): Promise<boolean> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { parentId: true },
  });

  if (!role || !role.parentId) return false;
  if (role.parentId === ancestorId) return true;

  return isRoleAncestor(role.parentId, ancestorId);
}

/**
 * Propagate permission changes to child roles
 */
export async function propagatePermissions(roleId: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { children: { where: { isActive: true, inheritsParent: true } } },
  });

  if (!role) return;

  const effectivePerms = await getEffectivePermissions(roleId);

  for (const child of role.children) {
    await prisma.role.update({
      where: { id: child.id },
      data: {
        permissions: effectivePerms,
      },
    });
    await propagatePermissions(child.id);
  }
}

/**
 * Create a new role with optional parent
 */
export async function createRole(input: {
  name: string;
  displayName: string;
  description?: string;
  parentId?: string;
  permissions?: string[];
  inheritsParent?: boolean;
}) {
  let level = 0;
  if (input.parentId) {
    const parent = await prisma.role.findUnique({ where: { id: input.parentId } });
    if (parent) level = parent.level + 1;
  }

  return prisma.role.create({
    data: {
      name: input.name,
      displayName: input.displayName,
      description: input.description,
      parentId: input.parentId,
      level,
      permissions: input.permissions || [],
      inheritsParent: input.inheritsParent ?? true,
    },
  });
}

/**
 * Assign role to user (replaces current role)
 */
export async function assignUserRole(userId: string, roleId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { role: roleId as UserRole },
  });
}