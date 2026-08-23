import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { bulkAnomalyFeedbackSchema, bulkInjectAnomalySchema, bulkDeleteAnomalySchema } from '@/lib/schemas';
import { success, ApiError, ValidationError, InternalServerError } from '@/lib/api-response';
import { invalidateOnMutation } from '@/lib/query';
import { saveAnomaly } from '@/lib/anomaly-service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.mutation, 'anomalies:bulk', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const action = body.action;

    if (!action || !['feedback', 'inject', 'delete'].includes(action)) {
      throw new ValidationError('Action must be "feedback", "inject", or "delete"');
    }

    if (action === 'feedback') {
      const validatedData = bulkAnomalyFeedbackSchema.parse(body);
      const { items } = validatedData;

      const results = await Promise.allSettled(
        items.map(async (item) => {
          const anomaly = await prisma.anomaly.findUnique({ where: { id: item.anomalyId } });
          if (!anomaly) {
            throw new Error(`Anomaly ${item.anomalyId} not found`);
          }
          return prisma.anomalyFeedback.create({
            data: {
              anomalyId: item.anomalyId,
              userId: item.userId,
              feedback: item.isTruePositive ? 'TRUE_POSITIVE' : 'FALSE_POSITIVE',
              comment: item.note,
            },
          });
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const errors = results
        .filter(r => r.status === 'rejected')
        .map(r => (r as PromiseRejectedResult).reason?.message ?? 'Unknown error');

      await logAudit({
        action: 'BULK_FEEDBACK',
        entity: 'AnomalyFeedback',
        entityId: `bulk:${items.map(i => i.anomalyId).join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'feedback',
          requested: items.length,
          successful,
          failed,
          errors,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('anomalies');

      return NextResponse.json(success(
        { action: 'feedback', requested: items.length, successful, failed },
        { message: `${successful} feedback submitted, ${failed} failed` }
      ));
    }

    if (action === 'inject') {
      const validatedData = bulkInjectAnomalySchema.parse(body);
      const { items } = validatedData;

      const results = await Promise.allSettled(
        items.map(async (item) => {
          // Use a default metric type and score for manual injection
          const severity = item.forceSeverity || 'MEDIUM';
          const score = severity === 'CRITICAL' ? 0.95 : severity === 'HIGH' ? 0.8 : severity === 'MEDIUM' ? 0.6 : 0.4;
          return saveAnomaly(prisma, item.deviceId, 'manual_inject', score, severity);
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const errors = results
        .filter(r => r.status === 'rejected')
        .map(r => (r as PromiseRejectedResult).reason?.message ?? 'Unknown error');

      await logAudit({
        action: 'BULK_INJECT',
        entity: 'Anomaly',
        entityId: `bulk:${items.map(i => i.deviceId).join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'inject',
          requested: items.length,
          successful,
          failed,
          errors,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('anomalies');

      return NextResponse.json(success(
        { action: 'inject', requested: items.length, successful, failed },
        { message: `${successful} anomalies injected, ${failed} failed` }
      ));
    }

    if (action === 'delete') {
      const validatedData = bulkDeleteAnomalySchema.parse(body);
      const { ids, confirm } = validatedData;

      if (!confirm) {
        throw new ValidationError('Confirmation required for bulk delete');
      }

      const deleted = await prisma.anomaly.deleteMany({
        where: { id: { in: ids } },
      });

      await logAudit({
        action: 'BULK_DELETE',
        entity: 'Anomaly',
        entityId: `bulk:${ids.join(',')}`,
        userId: auth.user.id,
        details: {
          action: 'delete',
          requested: ids.length,
          deleted: deleted.count,
          notFound: ids.length - deleted.count,
        },
        ipAddress: getClientIp(request),
      });

      await invalidateOnMutation('anomalies');

      return NextResponse.json(success(
        { action: 'delete', requested: ids.length, deleted: deleted.count },
        { message: `${deleted.count} anomaly record(s) deleted` }
      ));
    }

    throw new ValidationError('Invalid action');
  } catch (err) {
    console.error('[API /api/anomalies/bulk POST] Error:', err);
    if (err instanceof ApiError) {
      return NextResponse.json(err.toResponse(request.nextUrl.pathname), { status: err.statusCode });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(new ValidationError('Validation failed', err).toResponse(request.nextUrl.pathname), { status: 400 });
    }
    return NextResponse.json(new InternalServerError().toResponse(request.nextUrl.pathname), { status: 500 });
  }
}