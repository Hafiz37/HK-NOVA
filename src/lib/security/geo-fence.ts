import { getRedisClient } from '@/lib/redis-cache';

const GEO_CACHE_TTL = 86400 * 30; // 30 days

export interface GeoLocationData {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  timezone?: string;
}

export async function getIpGeolocation(ip: string): Promise<GeoLocationData | null> {
  if (isPrivateIp(ip)) {
    return { country: 'Local', countryCode: 'LOC', city: 'Local' };
  }

  // Check cache first
  const cached = await getCachedGeo(ip);
  if (cached) return cached;

  // Fetch from external service (ip-api.com free tier)
  const geo = await fetchGeoFromApi(ip);
  if (geo) {
    await cacheGeo(ip, geo);
    return geo;
  }

  return null;
}

async function getCachedGeo(ip: string): Promise<GeoLocationData | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const data = await redis.get(`ip:geo:${ip}`);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function cacheGeo(ip: string, data: GeoLocationData): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.setex(`ip:geo:${ip}`, GEO_CACHE_TTL, JSON.stringify(data));
  } catch {
    // Silently fail
  }
}

async function fetchGeoFromApi(ip: string): Promise<GeoLocationData | null> {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,city,lat,lon,isp,timezone`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status === 'success') {
      return {
        country: data.country,
        countryCode: data.countryCode,
        region: data.region,
        city: data.city,
        latitude: data.lat,
        longitude: data.lon,
        isp: data.isp,
        timezone: data.timezone,
      };
    }
  } catch {
    // Silently fail
  }
  return null;
}

function isPrivateIp(ip: string): boolean {
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

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}