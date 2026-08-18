import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getPollingIntervalMs, setPollingInterval, POLL_INTERVAL_OPTIONS, intervalToLabel, SETTING_KEY, DEFAULT_POLL_INTERVAL_MS } from '@/lib/polling-config';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const intervalMs = (await getPollingIntervalMs(prisma)) ?? DEFAULT_POLL_INTERVAL_MS;
    const label = intervalToLabel(intervalMs);
    const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });

    return NextResponse.json({
      data: {
        intervalMs,
        label,
        options: POLL_INTERVAL_OPTIONS,
        updatedAt: setting?.updatedAt ?? null,
      },
    });
  } catch (error) {
    console.error('[API /api/settings/polling-interval] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch polling interval' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.settings, 'settings:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { intervalMs } = body;

    if (!intervalMs || !POLL_INTERVAL_OPTIONS.some(opt => opt.valueMs === intervalMs)) {
      return NextResponse.json({ error: 'Invalid intervalMs' }, { status: 400 });
    }

    const beforeIntervalMs = await getPollingIntervalMs(prisma);

    await setPollingInterval(prisma, intervalMs);

    await logAudit({
      action: 'UPDATE',
      entity: 'Setting',
      entityId: SETTING_KEY,
      userId: auth.user.id,
      details: {
        before: { intervalMs: beforeIntervalMs ?? DEFAULT_POLL_INTERVAL_MS },
        after: { intervalMs },
        fieldsChanged: ['intervalMs'],
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      data: {
        intervalMs,
        label: intervalToLabel(intervalMs),
        message: `Polling interval set to ${intervalToLabel(intervalMs)}`,
      },
    });
  } catch (error) {
    console.error('[API /api/settings/polling-interval] POST error:', error);
    return NextResponse.json({ error: 'Failed to update polling interval' }, { status: 500 });
  }
}