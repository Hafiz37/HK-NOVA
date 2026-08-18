import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireSession, requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

const SETTING_KEY = 'demo:generator:enabled';

/**
 * GET /api/settings/demo-mode
 * Returns current demo mode settings (enabled status, demo device count)
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    const enabled = (setting?.value as { enabled?: boolean } | null)?.enabled ?? true;

    const demoDeviceCount = await prisma.device.count({
      where: { isDemo: true, deletedAt: null },
    });

    const realDeviceCount = await prisma.device.count({
      where: { isDemo: false, deletedAt: null },
    });

    return NextResponse.json({
      data: {
        generatorEnabled: enabled,
        demoDeviceCount,
        realDeviceCount,
        lastUpdated: setting?.updatedAt ?? null,
      },
    });
  } catch (error) {
    console.error('[API /api/settings/demo-mode GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch demo mode settings' }, { status: 500 });
  }
}

/**
 * POST /api/settings/demo-mode
 * Body: { enabled: boolean }
 * Toggles demo generator on/off (requires ADMIN role)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.settings, 'settings:mutation', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const enabled = body?.enabled;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    // Get current value for audit log
    const currentSetting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });
    const beforeEnabled = (currentSetting?.value as { enabled?: boolean } | null)?.enabled ?? true;

    // Store status in Setting model
    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: { enabled } },
      create: {
        key: SETTING_KEY,
        value: { enabled },
      },
    });

    await logAudit({
      action: 'UPDATE',
      entity: 'Setting',
      entityId: SETTING_KEY,
      userId: auth.user.id,
      details: {
        before: { enabled: beforeEnabled },
        after: { enabled },
        fieldsChanged: ['enabled'],
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      data: {
        generatorEnabled: enabled,
        message: `Demo generator ${enabled ? 'enabled' : 'disabled'}`,
      },
    });
  } catch (error) {
    console.error('[API /api/settings/demo-mode POST] Error:', error);
    return NextResponse.json({ error: 'Failed to update demo mode settings' }, { status: 500 });
  }
}