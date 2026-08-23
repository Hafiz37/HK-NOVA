import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { activateTemplateVersion } from '@/lib/template-versioning';
import { logAudit, getClientIp } from '@/lib/audit';
import type { TemplateName } from '@/lib/olt-templates';

/**
 * POST /api/provisioning/templates/:id/activate
 * Activate a template version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const versionRecord = await prisma.oltTemplateVersion.findUnique({ where: { id } });

    if (!versionRecord) {
      return NextResponse.json({ error: 'Template version not found' }, { status: 404 });
    }

    const updated = await activateTemplateVersion(prisma, versionRecord.name as TemplateName, versionRecord.version);

    await logAudit({
      action: 'UPDATE',
      entity: 'OltTemplateVersion',
      entityId: id,
      userId: auth.user.id,
      details: { name: versionRecord.name, version: versionRecord.version, action: 'ACTIVATE' },
      ipAddress: clientIp,
    });

    return NextResponse.json({ data: updated, message: `Template version ${versionRecord.version} berhasil diaktifkan` });
  } catch (error) {
    console.error('[API /api/provisioning/templates/:id/activate POST] Error:', error);
    return NextResponse.json({ error: 'Failed to activate template version' }, { status: 500 });
  }
}