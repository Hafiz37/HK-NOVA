import zxcvbn from 'zxcvbn';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

const MAX_PASSWORD_HISTORY = 5;

export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0-4
  feedback: string[];
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const feedback: string[] = [];
  if (!password || password.length < 8) {
    feedback.push('Password must be at least 8 characters long');
  }

  const result = zxcvbn(password);
  if (result.score < 2) {
    if (result.feedback.suggestions && result.feedback.suggestions.length > 0) {
      feedback.push(...result.feedback.suggestions);
    } else {
      feedback.push('Password is too weak. Try adding numbers or special symbols.');
    }
  }

  return {
    valid: feedback.length === 0,
    score: result.score,
    feedback,
  };
}

export async function checkPasswordHistory(userId: string, newPassword: string): Promise<boolean> {
  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_PASSWORD_HISTORY,
  });

  for (const record of history) {
    const match = await bcrypt.compare(newPassword, record.passwordHash);
    if (match) return true; // Reused password found
  }

  return false;
}

export async function recordPasswordHistory(userId: string, passwordHash: string, changedBy?: string): Promise<void> {
  await prisma.passwordHistory.create({
    data: {
      userId,
      passwordHash,
      changedBy: changedBy ?? 'self',
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordChangedAt: new Date(),
      mustChangePassword: false,
    },
  });
}
