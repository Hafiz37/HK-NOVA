import zxcvbn from 'zxcvbn';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const MAX_PASSWORD_HISTORY = 5;
const MIN_PRODUCTION_PASSWORD_LENGTH = 16;
const MIN_ENTROPY_BITS = 60;

export interface PasswordValidationResult {
  valid: boolean;
  score: number;
  entropy: number;
  feedback: string[];
}

export const strongPasswordSchema = z
  .string()
  .min(MIN_PRODUCTION_PASSWORD_LENGTH, `Password must be at least ${MIN_PRODUCTION_PASSWORD_LENGTH} characters`)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
  .refine(
    (val) => {
      const weakPatterns = [
        'password', 'admin', '123456', 'changeme', 'qwerty',
        'letmein', 'welcome', 'monkey', 'dragon', 'master',
        'abc123', 'iloveyou', 'password123', 'admin123'
      ];
      const lowerVal = val.toLowerCase();
      return !weakPatterns.some(weak => lowerVal.includes(weak));
    },
    'Password contains common weak pattern'
  )
  .refine(
    (val) => !/(.)\1{3,}/.test(val),
    'Password contains too many repeated characters'
  )
  .refine(
    (val) => {
      const sequences = ['1234', '2345', '3456', '4567', '5678', '6789', 'abcd', 'bcde', 'cdef'];
      const lowerVal = val.toLowerCase();
      return !sequences.some(seq => lowerVal.includes(seq));
    },
    'Password contains sequential characters'
  );

export function calculatePasswordEntropy(password: string): number {
  const charsetSize = new Set(password).size;
  return Math.log2(Math.pow(charsetSize, password.length));
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const feedback: string[] = [];
  
  if (!password || password.length < 8) {
    feedback.push('Password must be at least 8 characters long');
  }

  const result = zxcvbn(password);
  const entropy = calculatePasswordEntropy(password);
  
  const schemaResult = strongPasswordSchema.safeParse(password);
  if (!schemaResult.success) {
    schemaResult.error.issues.forEach(err => {
      feedback.push(err.message);
    });
  }
  
  if (entropy < MIN_ENTROPY_BITS) {
    feedback.push(`Password entropy too low (${entropy.toFixed(1)} bits, minimum: ${MIN_ENTROPY_BITS})`);
  }
  
  if (result.score < 2) {
    if (result.feedback.suggestions && result.feedback.suggestions.length > 0) {
      feedback.push(...result.feedback.suggestions);
    } else {
      feedback.push('Password is too weak. Try adding numbers or special symbols.');
    }
  }

  return {
    valid: feedback.length === 0 && entropy >= MIN_ENTROPY_BITS,
    score: result.score,
    entropy,
    feedback,
  };
}

export function validateProductionPassword(password: string): PasswordValidationResult {
  const validation = validatePasswordStrength(password);
  
  if (password === 'CHANGE_ME' || password === 'CHANGE_ME_MIN_16_CHARS') {
    validation.valid = false;
    validation.feedback.push('Production password must be changed from template value');
  }
  
  if (password.length < MIN_PRODUCTION_PASSWORD_LENGTH) {
    validation.valid = false;
    validation.feedback.push(`Production passwords require minimum ${MIN_PRODUCTION_PASSWORD_LENGTH} characters`);
  }
  
  return validation;
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
