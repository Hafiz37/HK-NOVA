import { getRedisClient } from '@/lib/redis-cache';
import { UserPermissionSet } from './permission-engine';

const PERMISSIONS_CACHE_TTL = 3600; // 1 hour

export async function getCachedPermissions(userId: string): Promise<UserPermissionSet | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const data = await redis.get(`permissions:user:${userId}`);
    if (!data) return null;

    const parsed = JSON.parse(data);
    return {
      rolePermissions: parsed.rolePermissions,
      resourcePermissions: new Map(Object.entries(parsed.resourcePermissions)),
      groupPermissions: parsed.groupPermissions,
      attributePermissions: new Map(Object.entries(parsed.attributePermissions)),
    };
  } catch {
    return null;
  }
}

export async function cachePermissions(userId: string, permissions: UserPermissionSet): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    const data = JSON.stringify({
      rolePermissions: permissions.rolePermissions,
      resourcePermissions: Object.fromEntries(permissions.resourcePermissions),
      groupPermissions: permissions.groupPermissions,
      attributePermissions: Object.fromEntries(permissions.attributePermissions),
    });
    await redis.setex(`permissions:user:${userId}`, PERMISSIONS_CACHE_TTL, data);
  } catch {
    // Silently fail caching
  }
}

export async function invalidateUserPermissions(userId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.del(`permissions:user:${userId}`);
  } catch {
    // Silently fail
  }
}

export async function invalidateResourcePermissions(resourceType: string, resourceId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    const pattern = `permissions:user:*`;
    const keys = await redis.keys(pattern);
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        const resourceKey = `${resourceType}:${resourceId}`;
        if (parsed.resourcePermissions?.[resourceKey]) {
          await redis.del(key);
        }
      }
    }
  } catch {
    // Silently fail
  }
}