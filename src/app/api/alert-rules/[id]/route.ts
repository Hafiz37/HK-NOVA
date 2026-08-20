import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole, AlertRuleOperator, AlertRuleDeviceScope, DeviceType, AlertSeverity } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const rule = await prisma.alertRule.findUnique({ where: { id } });
    if (!rule) return NextResponse.json({ error: 'Rule tidak ditemukan' }, { status: 404 });
    return NextResponse.json({ data: rule });
  } catch (error) {
    console.error('[API /api/alert-rules/[id] GET] Error:', error);
    return NextResponse.json({ error: 'Gagal mengambil rule' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.settings, 'alert-rules:update', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 });
    }

    const data: {
      name?: string;
      metric?: string;
      operator?: AlertRuleOperator;
      threshold?: number;
      severity?: AlertSeverity;
      consecutiveSamples?: number;
      deviceScope?: AlertRuleDeviceScope;
      deviceType?: DeviceType | null;
      deviceIds?: string[] | null;
      customOidId?: string | null;
      cooldownMs?: number;
      enabled?: boolean;
    } = {};
    if (typeof body.name === 'string') data.name = body.name.trim();
    if (typeof body.metric === 'string') data.metric = body.metric;
    if (body.operator) data.operator = body.operator as AlertRuleOperator;
    if (body.threshold !== undefined) data.threshold = Number(body.threshold);
    if (body.severity) data.severity = body.severity as AlertSeverity;
    if (body.consecutiveSamples !== undefined) data.consecutiveSamples = Number(body.consecutiveSamples) || 2;
    if (body.deviceScope) data.deviceScope = body.deviceScope as AlertRuleDeviceScope;
    if (body.deviceType !== undefined) data.deviceType = body.deviceType ? (body.deviceType as DeviceType) : null;
    if (body.deviceIds !== undefined) data.deviceIds = Array.isArray(body.deviceIds) ? (body.deviceIds as string[]) : null;
    if (body.customOidId !== undefined) data.customOidId = body.customOidId ? (body.customOidId as string) : null;
    if (body.cooldownMs !== undefined) data.cooldownMs = Number(body.cooldownMs) || 300000;
    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);

    const rule = await prisma.alertRule.update({
      where: { id },
      data: data as import('@prisma/client').Prisma.AlertRuleUpdateInput,
    });

    await logAudit({
      action: 'UPDATE',
      entity: 'AlertRule',
      entityId: id,
      userId: auth.user.id,
      details: { rule: { name: rule.name, metric: rule.metric, threshold: rule.threshold, changed: Object.keys(data) } },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ data: rule, message: 'Rule threshold berhasil diperbarui' });
  } catch (error) {
    console.error('[API /api/alert-rules/[id] PATCH] Error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui rule' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.settings, 'alert-rules:delete', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    await prisma.alertRule.delete({ where: { id } });
    return NextResponse.json({ message: 'Rule threshold berhasil dihapus' });
  } catch (error) {
    console.error('[API /api/alert-rules/[id] DELETE] Error:', error);
    return NextResponse.json({ error: 'Gagal menghapus rule' }, { status: 500 });
  }
}