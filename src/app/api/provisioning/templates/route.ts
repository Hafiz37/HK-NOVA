import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { createTemplateVersion, activateTemplateVersion, getActiveTemplate } from '@/lib/template-versioning';
import { logAudit, getClientIp } from '@/lib/audit';
import { OLT_TEMPLATES, type TemplateName, type OLTTemplate } from '@/lib/olt-templates';
import { mapErrorToCode, getHttpStatusForError } from '@/lib/provisioning-errors';

/**
 * GET /api/provisioning/templates?active=true
 * List template versions
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get('name');
    const active = searchParams.get('active');

    if (name && active === 'true') {
      const template = await getActiveTemplate(prisma, name as TemplateName);
      return NextResponse.json({ data: { name, content: template } });
    }

    const versions = await prisma.oltTemplateVersion.findMany({
      where: name ? { name } : undefined,
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });

    return NextResponse.json({ data: versions });
  } catch (error) {
    console.error('[API /api/provisioning/templates GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch template versions' }, { status: 500 });
  }
}

/**
 * POST /api/provisioning/templates
 * Create a new template version
 * Body: { name, version, content, changelog? }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa objek' }, { status: 400 });
    }

    const name = typeof body.name === 'string' ? body.name : '';
    const version = typeof body.version === 'string' ? body.version : '';
    const content = body.content;
    const changelog = typeof body.changelog === 'string' ? body.changelog : undefined;

    if (!name || !version || !content) {
      return NextResponse.json({ error: 'Fields name, version, content wajib diisi' }, { status: 400 });
    }

    if (!['huawei', 'zte', 'generic'].includes(name)) {
      return NextResponse.json({ error: 'Template name harus salah satu dari: huawei, zte, generic' }, { status: 400 });
    }

    const templateVersion = await createTemplateVersion(prisma, {
      name: name as TemplateName,
      version,
      content: content as OLTTemplate,
      changelog,
      createdBy: auth.user.id,
    });

    await logAudit({
      action: 'CREATE',
      entity: 'OltTemplateVersion',
      entityId: templateVersion.id,
      userId: auth.user.id,
      details: { name, version },
      ipAddress: clientIp,
    });

    return NextResponse.json({ data: templateVersion, message: 'Template version berhasil dibuat' });
  } catch (error) {
    console.error('[API /api/provisioning/templates POST] Error:', error);
    const provisioningError = mapErrorToCode(error);
    const status = getHttpStatusForError(provisioningError.code);
    return NextResponse.json(
      { error: provisioningError.userMessage, code: provisioningError.code },
      { status }
    );
  }
}