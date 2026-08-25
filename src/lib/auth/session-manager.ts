import prisma from '@/lib/prisma';
import { DeviceInfo } from './device-fingerprint';

const SESSION_TTL_HOURS = 12;

export interface SessionWithDetails {
  id: string;
  userId: string;
  deviceName: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string;
  country: string | null;
  city: string | null;
  isActive: boolean;
  isNewDevice: boolean;
  isNewLocation: boolean;
  isSuspicious: boolean;
  lastActivityAt: Date;
  createdAt: Date;
  expiresAt: Date;
}

export async function createOrUpdateUserSession(
  userId: string,
  refreshTokenId: string,
  deviceInfo: DeviceInfo
): Promise<SessionWithDetails> {
  // Check prior history for new device / location check
  const priorSessions = await prisma.userSession.findMany({
    where: { userId },
    select: { deviceFingerprint: true, country: true, city: true },
    take: 50,
  });

  const isNewDevice = !priorSessions.some((s) => s.deviceFingerprint === deviceInfo.fingerprint);
  const isNewLocation =
    deviceInfo.location?.country != null &&
    !priorSessions.some((s) => s.country === deviceInfo.location?.country);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION_TTL_HOURS);

  const session = await prisma.userSession.create({
    data: {
      userId,
      refreshTokenId,
      deviceFingerprint: deviceInfo.fingerprint,
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ipAddress: deviceInfo.ipAddress,
      country: deviceInfo.location?.country ?? null,
      city: deviceInfo.location?.city ?? null,
      isp: deviceInfo.location?.isp ?? null,
      isActive: true,
      expiresAt,
      isNewDevice,
      isNewLocation,
      isSuspicious: isNewDevice && isNewLocation,
    },
  });

  return session;
}

export async function getUserSessions(userId: string): Promise<SessionWithDetails[]> {
  const sessions = await prisma.userSession.findMany({
    where: {
      userId,
      isActive: true,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastActivityAt: 'desc' },
  });

  return sessions;
}

export async function terminateSession(sessionId: string, userId: string): Promise<boolean> {
  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) return false;

  await prisma.userSession.update({
    where: { id: sessionId },
    data: { isActive: false },
  });

  await prisma.refreshToken.update({
    where: { id: session.refreshTokenId },
    data: { revokedAt: new Date(), revokedReason: 'user_terminated_session' },
  });

  return true;
}

export async function terminateAllOtherSessions(
  userId: string,
  currentSessionId?: string
): Promise<number> {
  const whereClause: any = { userId, isActive: true };
  if (currentSessionId) {
    whereClause.id = { not: currentSessionId };
  }

  const sessionsToRevoke = await prisma.userSession.findMany({
    where: whereClause,
    select: { id: true, refreshTokenId: true },
  });

  if (sessionsToRevoke.length === 0) return 0;

  const refreshTokenIds = sessionsToRevoke.map((s) => s.refreshTokenId);

  await prisma.userSession.updateMany({
    where: { id: { in: sessionsToRevoke.map((s) => s.id) } },
    data: { isActive: false },
  });

  await prisma.refreshToken.updateMany({
    where: { id: { in: refreshTokenIds } },
    data: { revokedAt: new Date(), revokedReason: 'terminate_all_others' },
  });

  return sessionsToRevoke.length;
}

export async function touchSessionActivity(refreshTokenId: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { refreshTokenId, isActive: true },
    data: { lastActivityAt: new Date() },
  });
}
