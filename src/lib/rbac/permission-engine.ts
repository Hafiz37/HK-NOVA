import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { evaluateAttributePolicies } from './policy-evaluator';
import { getCachedPermissions, cachePermissions, invalidateUserPermissions } from './permission-cache';

export interface PermissionResult {
  allowed: boolean;
  source: 'role' | 'resource' | 'group' | 'attribute' | 'none';
  matchedPermissions: string[];
}

export interface UserPermissionSet {
  rolePermissions: string[];
  resourcePermissions: Map<string, string[]>;
  groupPermissions: string[];
  attributePermissions: Map<string, string[]>;
}

export async function checkPermission(
  userId: string,
  action: string,
  resourceType: string,
  resourceId?: string
): Promise<PermissionResult> {
  const permissions = await getUserPermissions(userId);
  const permissionKey = `${resourceType}:${action}`;

  // Check role permissions
  if (permissions.rolePermissions.includes(permissionKey) || permissions.rolePermissions.includes('*')) {
    return { allowed: true, source: 'role', matchedPermissions: [permissionKey] };
  }

  // Check group permissions
  if (permissions.groupPermissions.includes(permissionKey) || permissions.groupPermissions.includes('*')) {
    return { allowed: true, source: 'group', matchedPermissions: [permissionKey] };
  }

  // Check resource permissions
  if (resourceId) {
    const resourceKey = `${resourceType}:${resourceId}`;
    const resourcePerms = permissions.resourcePermissions.get(resourceKey);
    if (resourcePerms) {
      if (resourcePerms.includes(action) || resourcePerms.includes('*')) {
        return { allowed: true, source: 'resource', matchedPermissions: [`${resourceKey}:${action}`] };
      }
    }
    // Check wildcard resource type
    const wildcardKey = `${resourceType}:*`;
    const wildcardPerms = permissions.resourcePermissions.get(wildcardKey);
    if (wildcardPerms) {
      if (wildcardPerms.includes(action) || wildcardPerms.includes('*')) {
        return { allowed: true, source: 'resource', matchedPermissions: [`${wildcardKey}:${action}`] };
      }
    }
  }

  // Check attribute-based policies
  if (resourceId) {
    const resource = await getResourceForPolicy(resourceType, resourceId);
    if (resource) {
      const attrResult = await evaluateAttributePolicies(userId, resourceType, resource, action);
      if (attrResult.allowed) {
        return { allowed: true, source: 'attribute', matchedPermissions: attrResult.matchedPolicies };
      }
    }
  }

  return { allowed: false, source: 'none', matchedPermissions: [] };
}

export async function getUserPermissions(userId: string): Promise<UserPermissionSet> {
  const cached = await getCachedPermissions(userId);
  if (cached) return cached;

  const [rolePerms, resourcePerms, groupPerms, attributePerms] = await Promise.all([
    getRolePermissions(userId),
    getResourcePermissions(userId),
    getGroupPermissions(userId),
    getAttributePermissions(userId),
  ]);

  const result: UserPermissionSet = {
    rolePermissions: rolePerms,
    resourcePermissions: resourcePerms,
    groupPermissions: groupPerms,
    attributePermissions: attributePerms,
  };

  await cachePermissions(userId, result);
  return result;
}

async function getRolePermissions(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return [];

  const rolePerms = await prisma.rolePermission.findMany({
    where: { role: user.role },
    include: { permission: true },
  });

  return rolePerms
    .filter((rp) => rp.permission)
    .map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
}

async function getResourcePermissions(userId: string): Promise<Map<string, string[]>> {
  const resourcePerms = await prisma.resourcePermission.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  const map = new Map<string, string[]>();
  for (const rp of resourcePerms) {
    const key = `${rp.resourceType}:${rp.resourceId}`;
    const perms = rp.permissions as string[];
    map.set(key, perms);
  }
  return map;
}

async function getGroupPermissions(userId: string): Promise<string[]> {
  const groupMemberships = await prisma.userPermissionGroup.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: { group: true },
  });

  const permissions = new Set<string>();
  for (const gm of groupMemberships) {
    const groupPerms = gm.group.permissions as string[];
    for (const p of groupPerms) permissions.add(p);
  }
  return Array.from(permissions);
}

async function getAttributePermissions(userId: string): Promise<Map<string, string[]>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return new Map();

  const policies = await prisma.attributePolicy.findMany({
    where: { role: user.role, enabled: true },
    orderBy: { priority: 'desc' },
  });

  const map = new Map<string, string[]>();
  for (const policy of policies) {
    const key = `${policy.resourceType}:${policy.name}`;
    map.set(key, policy.permissions as string[]);
  }
  return map;
}

async function getResourceForPolicy(resourceType: string, resourceId: string): Promise<any> {
  switch (resourceType) {
    case 'Device':
      return prisma.device.findUnique({ where: { id: resourceId } });
    case 'Alert':
      return prisma.alert.findUnique({ where: { id: resourceId } });
    case 'Backup':
      return prisma.backup.findUnique({ where: { id: resourceId } });
    default:
      return null;
  }
}

export async function invalidatePermissions(userId: string): Promise<void> {
  await invalidateUserPermissions(userId);
}