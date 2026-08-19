import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { parsePositiveIntParam } from '@/lib/utils';
import { ProvisioningAction, ProvisioningStatus } from '@prisma/client';

/**
 * GET /api/provisioning/logs?deviceId=&action=&status=&page=&limit=
 * Returns the provisioning execution history.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const action = searchParams.get('action');
    const status = searchParams.get('status');
    const page = parsePositiveIntParam(searchParams.get('page'), 1, 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePositiveIntParam(searchParams.get('limit'), 20, 1, 100);

    const where: Record<string, unknown> = {};
    if (deviceId) where.deviceId = deviceId;
    if (action && Object.values(ProvisioningAction).includes(action as ProvisioningAction)) {
      where.action = action as ProvisioningAction;
    }
    if (status && Object.values(ProvisioningStatus).includes(status as ProvisioningStatus)) {
      where.status = status as ProvisioningStatus;
    }

    const [logs, total] = await Promise.all([
      prisma.provisioningLog.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          device: { select: { id: true, name: true, ip: true, type: true, vendor: true } },
        },
      }),
      prisma.provisioningLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[API /api/provisioning/logs GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch provisioning logs' }, { status: 500 });
  }
}