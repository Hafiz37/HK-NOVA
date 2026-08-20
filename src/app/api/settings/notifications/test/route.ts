import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from '@/lib/notify-config';
import { sendTestNotification } from '@/lib/notifier';

/**
 * POST /api/settings/notifications/test
 * Mengirim notifikasi uji ke satu channel untuk memverifikasi konfigurasi.
 * Body: { channel: "telegram" | "email" | "webhook" | "sms" | "siem" }.
 * ADMIN only + rate limit.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.settings, 'settings:notify-test', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as { channel?: string } | null;
    const channel = body?.channel as NotificationChannel | undefined;

    if (!channel || !NOTIFICATION_CHANNELS.includes(channel)) {
      return NextResponse.json(
        { error: `channel harus salah satu dari: ${NOTIFICATION_CHANNELS.join(', ')}` },
        { status: 400 }
      );
    }

    const { ok, error } = await sendTestNotification(prisma, channel);

    await logAudit({
      action: 'UPDATE',
      entity: 'Setting',
      entityId: 'notify:channels:test',
      userId: auth.user.id,
      details: {
        after: { channel, ok, error: error ?? null },
        fieldsChanged: ['notification-test'],
      },
      ipAddress: getClientIp(request),
    });

    if (!ok) {
      return NextResponse.json(
        { error: error ?? 'Gagal mengirim notifikasi uji' },
        { status: 502 }
      );
    }

    return NextResponse.json({ data: { channel, ok: true }, message: `Notifikasi uji dikirim via ${channel}` });
  } catch (error) {
    console.error('[API /api/settings/notifications/test POST] Error:', error);
    return NextResponse.json({ error: 'Gagal mengirim notifikasi uji' }, { status: 500 });
  }
}