import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const providers = await prisma.sSOProvider.findMany({
      select: {
        id: true,
        type: true,
        name: true,
        enabled: true,
        autoProvision: true,
        defaultRole: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ ok: true, providers });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, name, enabled, samlEntryPoint, samlIssuer, samlCert, oauthClientId, oauthClientSecret, oauthAuthUrl, oauthTokenUrl, autoProvision, defaultRole, roleMapping } = body;

    if (!type || !name) {
      return NextResponse.json({ ok: false, error: 'Type and Name are required' }, { status: 400 });
    }

    const provider = await prisma.sSOProvider.create({
      data: {
        type,
        name,
        enabled: enabled ?? true,
        samlEntryPoint,
        samlIssuer,
        samlCert,
        oauthClientId,
        oauthClientSecret,
        oauthAuthUrl,
        oauthTokenUrl,
        autoProvision: autoProvision ?? true,
        defaultRole: defaultRole ?? 'VIEWER',
        roleMapping: roleMapping ? JSON.parse(JSON.stringify(roleMapping)) : undefined,
      },
    });

    return NextResponse.json({ ok: true, provider }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
