import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { logAudit, getClientIp } from '@/lib/audit';

/**
 * GET /api/export/templates/:id
 * Get a single export template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const template = await prisma.exportTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json({ error: 'Export template not found' }, { status: 404 });
    }
    return NextResponse.json({ data: template });
  } catch (error) {
    console.error('[API /api/export/templates/:id GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch export template' }, { status: 500 });
  }
}

/**
 * PUT /api/export/templates/:id
 * Update an export template
 * Body: { name?, description?, format?, filters?, columns?, isDefault? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body harus berupa objek' }, { status: 400 });
    }

    const existing = await prisma.exportTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Export template not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.format !== undefined) {
      if (!['csv', 'xlsx', 'pdf'].includes(body.format)) {
        return NextResponse.json({ error: 'Format harus csv, xlsx, atau pdf' }, { status: 400 });
      }
      updateData.format = body.format;
    }
    if (body.filters !== undefined) updateData.filters = body.filters;
    if (body.columns !== undefined) {
      if (!Array.isArray(body.columns) || body.columns.length === 0) {
        return NextResponse.json({ error: 'Minimal satu kolom harus dipilih' }, { status: 400 });
      }
      updateData.columns = body.columns;
    }
    if (body.isDefault !== undefined) updateData.isDefault = body.isDefault;

    const template = await prisma.exportTemplate.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      action: 'UPDATE',
      entity: 'ExportTemplate',
      entityId: id,
      userId: auth.user.id,
      details: { name: template.name },
      ipAddress: clientIp,
    });

    return NextResponse.json({ data: template, message: 'Export template berhasil diupdate' });
  } catch (error) {
    console.error('[API /api/export/templates/:id PUT] Error:', error);
    return NextResponse.json({ error: 'Failed to update export template' }, { status: 500 });
  }
}

/**
 * DELETE /api/export/templates/:id
 * Delete an export template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const clientIp = getClientIp(request) || '127.0.0.1';

  const auth = await requireRole([UserRole.ADMIN]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const existing = await prisma.exportTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Export template not found' }, { status: 404 });
    }

    await prisma.exportTemplate.delete({ where: { id } });
    await logAudit({
      action: 'DELETE',
      entity: 'ExportTemplate',
      entityId: id,
      userId: auth.user.id,
      details: { name: existing.name },
      ipAddress: clientIp,
    });

    return NextResponse.json({ message: 'Export template berhasil dihapus' });
  } catch (error) {
    console.error('[API /api/export/templates/:id DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete export template' }, { status: 500 });
  }
}