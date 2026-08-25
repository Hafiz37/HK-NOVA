import { randomBytes, createHmac } from 'crypto';
import prisma from '@/lib/prisma';
import { DeviceInfo } from './device-fingerprint';

const REFRESH_TOKEN_MAX_AGE_DAYS = 7;
const REFRESH_COOKIE_NAME = 'hk_nova_refresh';

function getSecret(): string {
  return process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'dev-insecure-secret';
}

export interface RefreshTokenPayload {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
}

export async function createRefreshToken(
  userId: string,
  deviceInfo: DeviceInfo
): Promise<{ token: string; id: string }> {
  const randomStr = randomBytes(32).toString('hex');
  const token = `rft_${randomStr}`;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_MAX_AGE_DAYS);

  const created = await prisma.refreshToken.create({
    data: {
      userId,
      token,
      deviceId: deviceInfo.fingerprint,
      userAgent: deviceInfo.userAgent,
      ipAddress: deviceInfo.ipAddress,
      location: deviceInfo.location as any,
      expiresAt,
    },
    select: { id: true, token: true },
  });

  return created;
}

export async function verifyAndRotateRefreshToken(
  tokenStr: string,
  deviceInfo: DeviceInfo
): Promise<{ userId: string; newToken: string; newRefreshTokenId: string } | null> {
  if (!tokenStr || !tokenStr.startsWith('rft_')) return null;

  const existing = await prisma.refreshToken.findUnique({
    where: { token: tokenStr },
    include: { userSession: true },
  });

  if (!existing) return null;
  if (existing.revokedAt || existing.expiresAt < new Date()) return null;

  // Revoke old token
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
      revokedBy: existing.userId,
      revokedReason: 'rotated',
    },
  });

  // Issue new token
  const nextToken = await createRefreshToken(existing.userId, deviceInfo);

  // Transfer session linkage if exists
  if (existing.userSession) {
    await prisma.userSession.update({
      where: { id: existing.userSession.id },
      data: {
        refreshTokenId: nextToken.id,
        lastActivityAt: new Date(),
        ipAddress: deviceInfo.ipAddress,
        country: deviceInfo.location?.country,
        city: deviceInfo.location?.city,
      },
    });
  }

  return {
    userId: existing.userId,
    newToken: nextToken.token,
    newRefreshTokenId: nextToken.id,
  };
}

export async function revokeUserRefreshToken(
  tokenStr: string,
  reason = 'user_logout'
): Promise<boolean> {
  const existing = await prisma.refreshToken.findUnique({ where: { token: tokenStr } });
  if (!existing) return false;

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });

  if (existing.id) {
    await prisma.userSession.updateMany({
      where: { refreshTokenId: existing.id },
      data: { isActive: false },
    });
  }

  return true;
}

export async function revokeAllUserRefreshTokens(userId: string, reason = 'revoke_all'): Promise<number> {
  const res = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });

  await prisma.userSession.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });

  return res.count;
}

export function refreshCookieOptions(token: string) {
  return {
    name: REFRESH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_MAX_AGE_DAYS * 24 * 60 * 60,
  };
}

export function clearRefreshCookieOptions() {
  return {
    name: REFRESH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: 0,
  };
}

export { REFRESH_COOKIE_NAME };
