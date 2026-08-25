import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { matchCidr, matchIpRange } from './ip-reputation';
import { getIpGeolocation } from './geo-fence';

export interface IpCheckResult {
  allowed: boolean;
  reason?: string;
  rule?: any;
}

export async function checkIpAccess(
  ipAddress: string,
  userId?: string,
  role?: UserRole
): Promise<IpCheckResult> {
  // Check blacklist first (deny by default if matched)
  const blacklistResult = await checkBlacklist(ipAddress, userId, role);
  if (!blacklistResult.allowed) return blacklistResult;

  // Check whitelist (allow if matched, deny if whitelist exists but no match)
  const whitelistResult = await checkWhitelist(ipAddress, userId, role);
  if (!whitelistResult.allowed) return whitelistResult;

  // Check geo restrictions
  const geoResult = await checkGeoAccess(ipAddress, userId, role);
  if (!geoResult.allowed) return geoResult;

  return { allowed: true };
}

async function checkBlacklist(ipAddress: string, userId?: string, role?: UserRole): Promise<IpCheckResult> {
  const rules = await prisma.ipAccessControl.findMany({
    where: {
      type: 'blacklist',
      isActive: true,
      OR: [
        { scope: 'global' },
        { scope: 'user', userId },
        { scope: 'role', role },
      ],
    },
    orderBy: { priority: 'desc' },
  });

  for (const rule of rules) {
    if (await ipMatchesRule(ipAddress, rule)) {
      return { allowed: false, reason: rule.description || 'IP blacklisted', rule };
    }
  }

  return { allowed: true };
}

async function checkWhitelist(ipAddress: string, userId?: string, role?: UserRole): Promise<IpCheckResult> {
  const rules = await prisma.ipAccessControl.findMany({
    where: {
      type: 'whitelist',
      isActive: true,
      OR: [
        { scope: 'global' },
        { scope: 'user', userId },
        { scope: 'role', role },
      ],
    },
    orderBy: { priority: 'desc' },
  });

  // If no whitelist rules exist, allow (whitelist is optional)
  if (rules.length === 0) return { allowed: true };

  for (const rule of rules) {
    if (await ipMatchesRule(ipAddress, rule)) {
      return { allowed: true, rule };
    }
  }

  return { allowed: false, reason: 'IP not whitelisted' };
}

async function checkGeoAccess(
  ipAddress: string,
  userId?: string,
  role?: UserRole
): Promise<IpCheckResult> {
  const rules = await prisma.ipAccessControl.findMany({
    where: {
      isActive: true,
      OR: [
        { allowedCountries: { not: [] } },
        { blockedCountries: { not: [] } },
        { blockVpn: true },
        { blockProxy: true },
        { blockTor: true },
      ],
    },
    orderBy: { priority: 'desc' },
  });

  if (rules.length === 0) return { allowed: true };

  const geo = await getIpGeolocation(ipAddress);
  if (!geo) return { allowed: true }; // Unknown location, allow

  for (const rule of rules) {
    // Check country restrictions
    if (rule.allowedCountries && Array.isArray(rule.allowedCountries) && rule.allowedCountries.length > 0) {
      if (!rule.allowedCountries.includes(geo.country || '')) {
        return { allowed: false, reason: `Country ${geo.country} not in allowed list`, rule };
      }
    }

    if (rule.blockedCountries && Array.isArray(rule.blockedCountries) && rule.blockedCountries.length > 0) {
      if (rule.blockedCountries.includes(geo.country || '')) {
        return { allowed: false, reason: `Country ${geo.country} blocked`, rule };
      }
    }

    // VPN/Proxy/Tor checks would need external service
    // For now, just log
  }

  return { allowed: true };
}

async function ipMatchesRule(ipAddress: string, rule: any): Promise<boolean> {
  if (rule.ipAddress && ipAddress === rule.ipAddress) return true;
  if (rule.ipCidr && matchCidr(ipAddress, rule.ipCidr)) return true;
  if (rule.ipRange && matchIpRange(ipAddress, rule.ipRange)) return true;
  return false;
}

export async function autoBlacklistIp(ipAddress: string, reason: string): Promise<void> {
  await prisma.ipAccessControl.create({
    data: {
      type: 'blacklist',
      scope: 'global',
      ipAddress,
      description: `Auto-blacklisted: ${reason}`,
      isActive: true,
      priority: 100,
    },
  });
}