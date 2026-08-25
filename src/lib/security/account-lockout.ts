import prisma from '@/lib/prisma';
import { DeviceInfo } from '@/lib/auth/device-fingerprint';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function checkAccountLocked(userId: string): Promise<{ locked: boolean; until?: Date; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isLocked: true, lockedUntil: true, lockedReason: true },
  });

  if (!user) return { locked: false };

  if (user.isLocked && user.lockedUntil) {
    if (user.lockedUntil > new Date()) {
      return { locked: true, until: user.lockedUntil, reason: user.lockedReason ?? 'Too many failed login attempts' };
    } else {
      // Auto-unlock if expired
      await unlockAccount(userId, 'auto_expiry', 'system');
      return { locked: false };
    }
  }

  return { locked: false };
}

export async function recordLoginAttempt(
  username: string,
  userId: string | null,
  success: boolean,
  deviceInfo: DeviceInfo,
  failureReason?: string
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      username,
      userId,
      success,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      country: deviceInfo.location?.country,
      city: deviceInfo.location?.city,
      deviceFingerprint: deviceInfo.fingerprint,
      failureReason,
    },
  });

  if (userId) {
    await prisma.loginHistory.create({
      data: {
        userId,
        success,
        ipAddress: deviceInfo.ipAddress,
        country: deviceInfo.location?.country,
        city: deviceInfo.location?.city,
        deviceFingerprint: deviceInfo.fingerprint,
        deviceName: deviceInfo.deviceName,
        failureReason,
      },
    });

    if (!success) {
      const lockoutRecord = await prisma.accountLockout.upsert({
        where: { userId },
        create: {
          userId,
          isLocked: false,
          lockReason: 'failed_attempts',
          lockedUntil: new Date(),
          failedAttempts: 1,
          lastAttemptAt: new Date(),
        },
        update: {
          failedAttempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });

      if (lockoutRecord.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date();
        lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCKOUT_MINUTES);

        await prisma.accountLockout.update({
          where: { userId },
          data: {
            isLocked: true,
            lockedUntil,
            lockReason: `Locked due to ${lockoutRecord.failedAttempts} failed login attempts`,
          },
        });

        await prisma.user.update({
          where: { id: userId },
          data: {
            isLocked: true,
            lockedUntil,
            lockedReason: `Account locked due to consecutive failed login attempts`,
          },
        });

        await prisma.securityEvent.create({
          data: {
            userId,
            eventType: 'account_locked',
            severity: 'high',
            description: `Account for ${username} was automatically locked after ${lockoutRecord.failedAttempts} failed login attempts.`,
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent,
          },
        });
      }
    } else {
      // Reset failed count on successful login
      await prisma.accountLockout.updateMany({
        where: { userId },
        data: {
          failedAttempts: 0,
          isLocked: false,
        },
      });
    }
  }
}

export async function unlockAccount(userId: string, method = 'manual', unlockedBy = 'admin'): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      isLocked: false,
      lockedUntil: null,
      lockedReason: null,
    },
  });

  await prisma.accountLockout.updateMany({
    where: { userId },
    data: {
      isLocked: false,
      failedAttempts: 0,
      unlockedAt: new Date(),
      unlockMethod: method,
      unlockedBy,
    },
  });

  await prisma.securityEvent.create({
    data: {
      userId,
      eventType: 'account_unlocked',
      severity: 'medium',
      description: `Account unlocked by ${unlockedBy} via ${method}`,
    },
  });
}
