import { randomBytes } from 'crypto';
import prisma from '@/lib/prisma';

const CHALLENGE_TTL_MINUTES = 10;

export async function createMfaChallenge(
  userId: string,
  method = 'totp',
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const sessionToken = `mfa_ch_${randomBytes(24).toString('hex')}`;
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + CHALLENGE_TTL_MINUTES);

  await prisma.mfaChallenge.create({
    data: {
      userId,
      sessionToken,
      method,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  return sessionToken;
}

export async function getMfaChallenge(sessionToken: string) {
  if (!sessionToken || !sessionToken.startsWith('mfa_ch_')) return null;

  const challenge = await prisma.mfaChallenge.findUnique({
    where: { sessionToken },
  });

  if (!challenge) return null;
  if (challenge.verified || challenge.expiresAt < new Date()) return null;
  if (challenge.attempts >= challenge.maxAttempts) return null;

  return challenge;
}

export async function incrementChallengeAttempts(sessionToken: string): Promise<number> {
  const updated = await prisma.mfaChallenge.update({
    where: { sessionToken },
    data: { attempts: { increment: 1 } },
  });
  return updated.attempts;
}

export async function markChallengeVerified(sessionToken: string): Promise<void> {
  await prisma.mfaChallenge.update({
    where: { sessionToken },
    data: { verified: true, verifiedAt: new Date() },
  });
}
