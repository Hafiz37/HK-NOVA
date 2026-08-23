import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { getExportTemplates, createExportTemplate, seedDefaultExportTemplates } from '@/lib/export-templates';
import { logAudit, getClientIp } from '@/lib/audit';

/**
 * GET /api/export/templates
 * List export templates
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    await seedDefaultExportTemplates(prisma);
    const templates = await getExportTemplates(prisma, auth.user.id);
    return NextResponse.json({ data: templates });
  } catch (error) {
    console.error('[API /api/export/templates GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch export templates' }, { status: 500 });
  }
}

/**
 * POST /api/export/templates
 * Create a new export template
 * Body: { name, description?, format, filters, columns, isDefault? }
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

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description : undefined;
    const format = typeof body.format === 'string' ? body.format : 'csv';
    const filters = body.filters ?? {};
    const columns = Array.isArray(body.columns) ? body.columns : [];
    const isDefault = body.isDefault === true;

    if (!name) {
      return NextResponse.json({ error: 'Field name wajib diisi' }, { status: 400 });
    }
    if (!['csv', 'xlsx', 'pdf'].includes(format)) {
      return NextResponse.json({ error: 'Format harus csv, xlsx, atau pdf' }, { status: 400 });
    }
    if (columns.length === 0) {
      return NextResponse.json({ error: 'Minimal satu kolom harus dipilih' }, { status: 400 });
    }

    const template = await createExportTemplate(prisma, {
      name,
      description,
      format,
      filters,
      columns,
      isDefault,
      createdBy: auth.user.id,
    });

    await logAudit({
      action: 'CREATE',
      entity: 'ExportTemplate',
      entityId: template.id,
      userId: auth.user.id,
      details: { name, format },
      ipAddress: clientIp,
    });

    return NextResponse.json({ data: template, message: 'Export template berhasil dibuat' });
  } catch (error) {
    console.error('[API /api/export/templates POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create export template' }, { status: 500 });
  }
}