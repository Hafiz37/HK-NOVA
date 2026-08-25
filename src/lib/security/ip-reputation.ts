import { getRedisClient } from '@/lib/redis-cache';

const REPUTATION_CACHE_TTL = 86400; // 24 hours

export interface IpReputationData {
  ipAddress: string;
  isVpn: boolean;
  isProxy: boolean;
  isTor: boolean;
  isHosting: boolean;
  riskScore: number;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  country?: string;
  isp?: string;
  failedLoginCount: number;
  lastFailedLogin?: Date;
  blockedAt?: Date;
  abuseConfidence?: number;
}

export async function getIpReputation(ipAddress: string): Promise<IpReputationData | null> {
  if (isPrivateIp(ipAddress)) {
    return {
      ipAddress,
      isVpn: false,
      isProxy: false,
      isTor: false,
      isHosting: false,
      riskScore: 0,
      threatLevel: 'low',
      country: 'Local',
      failedLoginCount: 0,
    };
  }

  // Check cache first
  const cached = await getCachedReputation(ipAddress);
  if (cached) return cached;

  // Check database
  const dbReputation = await import('@/lib/prisma').then(m => m.default.ipReputation.findUnique({
    where: { ipAddress },
  }));

  if (dbReputation && dbReputation.lastChecked > new Date(Date.now() - REPUTATION_CACHE_TTL * 1000)) {
    const result = formatReputation(dbReputation);
    await cacheReputation(ipAddress, result);
    return result;
  }

  // Fetch fresh reputation (in production, use external API)
  const fresh = await fetchIpReputation(ipAddress);
  if (fresh) {
    await upsertReputation(fresh);
    await cacheReputation(ipAddress, fresh);
    return fresh;
  }

  // Return default
  return {
    ipAddress,
    isVpn: false,
    isProxy: false,
    isTor: false,
    isHosting: false,
    riskScore: 0,
    threatLevel: 'low',
    failedLoginCount: 0,
  };
}

async function getCachedReputation(ip: string): Promise<IpReputationData | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const data = await redis.get(`ip:reputation:${ip}`);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function cacheReputation(ip: string, data: IpReputationData): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.setex(`ip:reputation:${ip}`, REPUTATION_CACHE_TTL, JSON.stringify(data));
  } catch {
    // Silently fail
  }
}

async function upsertReputation(data: IpReputationData): Promise<void> {
  await import('@/lib/prisma').then(m => m.default.ipReputation.upsert({
    where: { ipAddress: data.ipAddress },
    create: data,
    update: data,
  }));
}

async function fetchIpReputation(ip: string): Promise<IpReputationData | null> {
  // In production, integrate with:
  // - AbuseIPDB API
  // - IPQualityScore API
  // - ProxyCheck.io
  // - IPHub.info
  // For now, return basic info
  return null;
}

export function isPrivateIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true;

  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 127.0.0.0/8
  if (parts[0] === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;

  return false;
}

export function matchCidr(ip: string, cidr: string): boolean {
  const [rangeIp, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits)) return false;

  const ipParts = ip.split('.').map(Number);
  const rangeParts = rangeIp.split('.').map(Number);

  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;

  const mask = ~((1 << (32 - bits)) - 1);

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];

  return (ipNum & mask) === (rangeNum & mask);
}

export function matchIpRange(ip: string, range: { start: string; end: string }): boolean {
  const ipNum = ipToNumber(ip);
  const startNum = ipToNumber(range.start);
  const endNum = ipToNumber(range.end);
  return ipNum >= startNum && ipNum <= endNum;
}

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
}

function formatReputation(db: any): IpReputationData {
  return {
    ipAddress: db.ipAddress,
    isVpn: db.isVpn,
    isProxy: db.isProxy,
    isTor: db.isTor,
    isHosting: db.isHosting,
    riskScore: db.riskScore,
    threatLevel: db.threatLevel,
    country: db.country,
    isp: db.isp,
    failedLoginCount: db.failedLoginCount,
    lastFailedLogin: db.lastFailedLogin,
    blockedAt: db.blockedAt,
    abuseConfidence: db.abuseConfidence,
  };
}