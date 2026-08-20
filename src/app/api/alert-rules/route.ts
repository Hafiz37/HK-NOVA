import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UserRole, AlertRuleOperator, AlertRuleDeviceScope, DeviceType } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { logAudit, getClientIp } from '@/lib/audit';
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import type { RuleInput } from '@/lib/alert-rules';

const VALID_METRICS = ['cpu', 'mem', 'latency', 'packetLoss', 'jitter', 'customOid'];

function parseBody(body: unknown): { data: RuleInput; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { data: {} as RuleInput, error: 'Body harus berupa objek' };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.name !== 'string' || !b.name.trim()) return { data: {} as RuleInput, error: 'name wajib diisi' };
  if (typeof b.metric !== 'string' || !VALID_METRICS.includes(b.metric)) {
    return { data: {} as RuleInput, error: `metric harus salah satu dari: ${VALID_METRICS.join(', ')}` };
  }
  const operator = b.operator as RuleInput['operator'];
  if (!operator || !['GT', 'GTE', 'LT', 'LTE'].includes(operator)) {
    return { data: {} as RuleInput, error: 'operator harus GT/GTE/LT/LTE' };
  }
  const threshold = Number(b.threshold);
  if (!Number.isFinite(threshold)) return { data: {} as RuleInput, error: 'threshold harus berupa angka' };
  const severity = b.severity as RuleInput['severity'];
  if (!severity || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) {
    return { data: {} as RuleInput, error: 'severity harus LOW/MEDIUM/HIGH/CRITICAL' };
  }
  const deviceScope = (b.deviceScope as RuleInput['deviceScope']) ?? 'ALL';
  if (!['ALL', 'DEVICE_TYPE', 'DEVICES'].includes(deviceScope)) {
    return { data: {} as RuleInput, error: 'deviceScope harus ALL/DEVICE_TYPE/DEVICES' };
  }
  return {
    data: {
      name: b.name.trim(),
      metric: b.metric,
      operator,
      threshold,
      severity,
      consecutiveSamples: Number(b.consecutiveSamples) || 2,
      deviceScope,
      deviceType: (b.deviceType as string) || null,
      deviceIds: Array.isArray(b.deviceIds) ? (b.deviceIds as string[]) : null,
      customOidId: (b.customOidId as string) || null,
      cooldownMs: Number(b.cooldownMs) || 300000,
      enabled: b.enabled === undefined ? true : Boolean(b.enabled),
    },
  };
}

export async function GET(): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const list = await prisma.alertRule.findMany({ orderBy: { updatedAt: 'desc' } });
    return NextResponse.json({ data: list });
  } catch (error) {
    console.error('[API /api/alert-rules GET] Error:', error);
    return NextResponse.json({ error: 'Gagal mengambil rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';
  const rateLimitError = rateLimitResponse(RATE_LIMITS.settings, 'alert-rules:create', clientIp);
  if (rateLimitError) return rateLimitError;

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    const { data, error } = parseBody(body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const rule = await prisma.alertRule.create({
      data: {
        name: data.name,
        metric: data.metric,
        operator: data.operator as AlertRuleOperator,
        threshold: data.threshold,
        severity: data.severity,
        consecutiveSamples: data.consecutiveSamples ?? 2,
        deviceScope: (data.deviceScope ?? 'ALL') as AlertRuleDeviceScope,
        deviceType: data.deviceType ? (data.deviceType as DeviceType) : null,
        deviceIds: data.deviceIds ?? undefined,
        customOidId: data.customOidId || null,
        cooldownMs: data.cooldownMs ?? 300000,
        enabled: data.enabled ?? true,
      },
    });

    await logAudit({
      action: 'CREATE',
      entity: 'AlertRule',
      entityId: rule.id,
      userId: auth.user.id,
      details: { rule: { name: rule.name, metric: rule.metric, threshold: rule.threshold, severity: rule.severity } },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ data: rule, message: 'Rule threshold berhasil dibuat' }, { status: 201 });
  } catch (error) {
    console.error('[API /api/alert-rules POST] Error:', error);
    return NextResponse.json({ error: 'Gagal membuat rule' }, { status: 500 });
  }
}