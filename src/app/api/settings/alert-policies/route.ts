import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import {
  getAlertPolicy,
  saveAlertPolicy,
  DEFAULT_ALERT_POLICY,
  type AlertPolicy,
} from '@/lib/alert-policy';

/**
 * GET /api/settings/alert-policies
 * Mengembalikan policy alert (SLA + eskalasi + reminder) saat ini.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const policy = await getAlertPolicy(prisma);
    return NextResponse.json({ data: policy });
  } catch (error) {
    console.error('[API /api/settings/alert-policies GET] Error:', error);
    return NextResponse.json({ error: 'Gagal membaca policy alert' }, { status: 500 });
  }
}

/**
 * POST /api/settings/alert-policies
 * Menyimpan policy alert. Seluruh field opsional; nilai kosong memakai default.
 * ADMIN only.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.settings, 'settings:alert-policy', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as Partial<AlertPolicy> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa objek policy' }, { status: 400 });
    }

    const before = await getAlertPolicy(prisma);
    const normalized = { ...before, ...body, escalationStages: body.escalationStages ?? before.escalationStages };
    await saveAlertPolicy(prisma, normalized);
    const after = await getAlertPolicy(prisma);

    await logAudit({
      action: 'UPDATE',
      entity: 'Setting',
      entityId: 'alert:policies',
      userId: auth.user.id,
      details: {
        before: { ...before },
        after: { ...after },
        fieldsChanged: ['alert-policies'],
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ data: after, message: 'Policy alert berhasil disimpan' });
  } catch (error) {
    console.error('[API /api/settings/alert-policies POST] Error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan policy alert' }, { status: 500 });
  }
}

export { DEFAULT_ALERT_POLICY };