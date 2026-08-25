import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { getIpReputation } from '@/lib/security/ip-reputation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { ip } = await params;
    const reputation = await getIpReputation(ip);

    if (!reputation) {
      return NextResponse.json({ error: 'IP reputation not found' }, { status: 404 });
    }

    // Also get any access control rules for this IP
    const rules = await prisma.ipAccessControl.findMany({
      where: {
        OR: [
          { ipAddress: ip },
          { ipCidr: { contains: ip.split('/')[0] } },
        ],
        isActive: true,
      },
    });

    return NextResponse.json({
      data: {
        reputation,
        accessRules: rules,
      },
    });
  } catch (error) {
    console.error('[API /api/security/ip-reputation/[ip] GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch IP reputation' }, { status: 500 });
  }
}