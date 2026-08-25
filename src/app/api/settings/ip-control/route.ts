import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const scope = searchParams.get('scope');
    const isActive = searchParams.get('isActive');

    const where: any = {};
    if (type) where.type = type;
    if (scope) where.scope = scope;
    if (isActive !== null) where.isActive = isActive === 'true';

    const rules = await prisma.ipAccessControl.findMany({
      where,
      orderBy: { priority: 'desc' },
    });

    return NextResponse.json({ data: rules });
  } catch (error) {
    console.error('[API /api/settings/ip-control GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch IP access rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      type,
      scope,
      userId,
      role,
      ipAddress,
      ipCidr,
      ipRange,
      allowedCountries,
      blockedCountries,
      blockVpn,
      blockProxy,
      blockTor,
      description,
      priority,
    } = body;

    if (!type || !scope) {
      return NextResponse.json({ error: 'type and scope are required' }, { status: 400 });
    }

    if (!['whitelist', 'blacklist'].includes(type)) {
      return NextResponse.json({ error: 'type must be whitelist or blacklist' }, { status: 400 });
    }

    if (!['global', 'user', 'role'].includes(scope)) {
      return NextResponse.json({ error: 'scope must be global, user, or role' }, { status: 400 });
    }

    // Validate IP formats
    if (ipCidr) {
      const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
      if (!cidrRegex.test(ipCidr)) {
        return NextResponse.json({ error: 'Invalid CIDR format' }, { status: 400 });
      }
    }

    if (ipRange) {
      if (!ipRange.start || !ipRange.end) {
        return NextResponse.json({ error: 'ipRange must have start and end' }, { status: 400 });
      }
    }

    const rule = await prisma.ipAccessControl.create({
      data: {
        type,
        scope,
        userId,
        role,
        ipAddress,
        ipCidr,
        ipRange: ipRange as any,
        allowedCountries,
        blockedCountries,
        blockVpn: blockVpn ?? false,
        blockProxy: blockProxy ?? false,
        blockTor: blockTor ?? false,
        description,
        priority: priority ?? 0,
        createdBy: auth.user.username,
      },
    });

    return NextResponse.json({ data: rule }, { status: 201 });
  } catch (error) {
    console.error('[API /api/settings/ip-control POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create IP access rule' }, { status: 500 });
  }
}