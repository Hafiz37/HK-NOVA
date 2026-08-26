import { prisma } from '@/lib/prisma';
import type { UserRole } from '@prisma/client';

export interface SSOUserProfile {
  externalId: string;
  email: string;
  username?: string;
  name?: string;
  groups?: string[];
  rawAttributes?: Record<string, unknown>;
}

/**
 * Provision user upon first SSO login (Just-In-Time)
 */
export async function provisionUser(ssoProfile: SSOUserProfile, providerId: string) {
  const existingConnection = await prisma.sSOConnection.findUnique({
    where: {
      providerId_externalId: {
        providerId,
        externalId: ssoProfile.externalId,
      },
    },
    include: { user: true },
  });

  if (existingConnection) {
    await prisma.sSOConnection.update({
      where: { id: existingConnection.id },
      data: { lastLogin: new Date(), metadata: JSON.parse(JSON.stringify(ssoProfile.rawAttributes ?? {})) },
    });
    return existingConnection.user;
  }

  // Check if user exists by email
  let user = await prisma.user.findUnique({
    where: { email: ssoProfile.email },
  });

  const provider = await prisma.sSOProvider.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    throw new Error('SSO Provider not found');
  }

  if (!user) {
    if (!provider.autoProvision) {
      throw new Error('User auto-provisioning is disabled for this SSO Provider');
    }

    const assignedRole = assignRoleFromSSO(ssoProfile.groups ?? [], provider.roleMapping as Record<string, UserRole> | null) || provider.defaultRole;

    const username = ssoProfile.username || ssoProfile.email.split('@')[0] + '_' + Math.random().toString(36).substring(2, 7);

    user = await prisma.user.create({
      data: {
        username,
        email: ssoProfile.email,
        fullName: ssoProfile.name || username,
        role: assignedRole,
        passwordHash: 'SSO_EXTERNAL_USER', // Non-usable password
      },
    });
  }

  // Link SSO connection
  await prisma.sSOConnection.create({
    data: {
      userId: user.id,
      providerId,
      externalId: ssoProfile.externalId,
      email: ssoProfile.email,
      metadata: JSON.parse(JSON.stringify(ssoProfile.rawAttributes ?? {})),
      lastLogin: new Date(),
    },
  });

  return user;
}

/**
 * Sync user attributes from SSO login response
 */
export async function syncUserAttributes(userId: string, ssoProfile: SSOUserProfile, providerId: string) {
  const provider = await prisma.sSOProvider.findUnique({
    where: { id: providerId },
  });

  if (!provider) return;

  const newRole = assignRoleFromSSO(ssoProfile.groups ?? [], provider.roleMapping as Record<string, UserRole> | null);

  await prisma.user.update({
    where: { id: userId },
    data: {
      fullName: ssoProfile.name ? ssoProfile.name : undefined,
      role: newRole ? newRole : undefined,
    },
  });
}

/**
 * Map SSO groups/claims to internal system roles
 */
export function assignRoleFromSSO(
  groups: string[],
  roleMapping: Record<string, UserRole> | null
): UserRole | null {
  if (!roleMapping || !groups || groups.length === 0) return null;

  for (const group of groups) {
    if (roleMapping[group]) {
      return roleMapping[group];
    }
  }

  return null;
}
