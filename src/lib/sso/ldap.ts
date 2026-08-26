import { prisma } from '@/lib/prisma';

/**
 * LDAP user lookup helper stub
 */
export async function searchLDAPUser(providerId: string, username: string) {
  const provider = await prisma.sSOProvider.findFirst({
    where: { id: providerId, type: 'LDAP', enabled: true },
  });

  if (!provider || !provider.ldapUrl) {
    throw new Error('LDAP provider not configured');
  }

  return {
    externalId: `ldap_${username}`,
    email: `${username}@domain.local`,
    name: username,
    groups: ['LDAP_USERS'],
    rawAttributes: { dn: `cn=${username},${provider.ldapSearchBase || ''}` },
  };
}
