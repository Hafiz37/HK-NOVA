import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { bulkUpdateFeatureFlagsSchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, InternalServerError } from '@/lib/api-response';
import { invalidateOnMutation } from '@/lib/query';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'feature-flags:bulk', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const action = body.action;

    if (!action || !['update', 'enable', 'disable'].includes(action)) {
      throw new ValidationError('Action must be "update", "enable", or "disable"');
    }

    if (action === 'update') {
      const validatedData = bulkUpdateFeatureFlagsSchema.parse(body);
      const { flags } = validatedData;

      const results = await Promise.allSettled(
        flags.map(async (flag) => {
          return prisma.featureFlag.update({
            where: { key: flag.key },
            data: { enabled: flag.enabled, updatedBy: auth.user.id },
          });
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const errors = results
        .filter(r => r.status === 'rejected')
        .map(r => (r as PromiseRejectedResult).reason?.message ?? 'Unknown error');

      await logAudit({
        action: 'BULK_UPDATE',
        entity: 'FeatureFlag',
        entityId: `bulk:${flags.map(f => f.key).join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'update',
          requested: flags.length,
          successful,
          failed,
          errors,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('featureFlags');

      return NextResponse.json(success(
        { action: 'update', requested: flags.length, successful, failed },
        { message: `${successful} feature flags updated, ${failed} failed` }
      ));
    }

    if (action === 'enable' || action === 'disable') {
      const validatedData = bulkUpdateFeatureFlagsSchema.parse({
        flags: body.flags.map((key: string) => ({ key, enabled: action === 'enable' })),
      });

      const results = await Promise.allSettled(
        validatedData.flags.map(async (flag) => {
          return prisma.featureFlag.update({
            where: { key: flag.key },
            data: { enabled: flag.enabled, updatedBy: auth.user.id },
          });
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      await logAudit({
        action: action.toUpperCase(),
        entity: 'FeatureFlag',
        entityId: `bulk:${validatedData.flags.map(f => f.key).join(',')}`,
        userId: auth.user.id,
        details: {
          action,
          requested: validatedData.flags.length,
          successful,
          failed,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('featureFlags');

      return NextResponse.json(success(
        { action, requested: validatedData.flags.length, successful, failed },
        { message: `${successful} feature flags ${action}d, ${failed} failed` }
      ));
    }

    throw new ValidationError('Invalid action');
  } catch (err) {
    console.error('[API /api/feature-flags/bulk POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}