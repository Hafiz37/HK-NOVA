import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { changePasswordSchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, UnauthorizedError, InternalServerError } from '@/lib/api-response';
import { 
  validatePasswordStrength, 
  checkPasswordHistory, 
  recordPasswordHistory 
} from '@/lib/security/password-policy';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.users, 'change-password', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const validatedData = changePasswordSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      validatedData.currentPassword,
      user.passwordHash
    );

    if (!isCurrentPasswordValid) {
      await logAudit({
        action: 'CHANGE_PASSWORD_FAILED',
        entity: 'User',
        entityId: user.id,
        userId: auth.user.id,
        details: { reason: 'Invalid current password' },
        ipAddress: clientIp,
      });

      throw new UnauthorizedError('Current password is incorrect');
    }

    const passwordValidation = validatePasswordStrength(validatedData.newPassword);
    if (!passwordValidation.valid) {
      throw new ValidationError(
        'Password does not meet security requirements',
        new Error(passwordValidation.feedback.join('; '))
      );
    }

    const isReused = await checkPasswordHistory(user.id, validatedData.newPassword);
    if (isReused) {
      throw new ValidationError(
        'Password has been used recently. Please choose a different password.',
        new Error('Password reuse detected')
      );
    }

    const newPasswordHash = await bcrypt.hash(validatedData.newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { 
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });

    await recordPasswordHistory(user.id, newPasswordHash, auth.user.id);

    await logAudit({
      action: 'CHANGE_PASSWORD',
      entity: 'User',
      entityId: user.id,
      userId: auth.user.id,
      details: { 
        passwordStrength: passwordValidation.score,
        entropy: passwordValidation.entropy.toFixed(1),
      },
      ipAddress: clientIp,
    });

    return NextResponse.json(
      success(
        { message: 'Password changed successfully' },
        { message: 'Your password has been updated' }
      )
    );
  } catch (err) {
    console.error('[API /api/auth/change-password POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(
        new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname),
        { status: 400 }
      );
    }
    return NextResponse.json(
      new InternalServerError().toResponse(request.nextUrl.pathname),
      { status: 500 }
    );
  }
}
