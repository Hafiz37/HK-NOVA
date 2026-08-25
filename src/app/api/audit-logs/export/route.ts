import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { exportAuditForCompliance } from '@/lib/audit/compliance';
import prisma from '@/lib/prisma';
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { format = 'json', startDate, endDate, entity, action, userId } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const { data, filename } = await exportAuditForCompliance(
      format,
      new Date(startDate),
      new Date(endDate),
      { entity, action, userId }
    );

    const fileHash = createHash('sha256').update(data).digest('hex');

    await prisma.auditLog.create({
      data: {
        action: 'EXPORT',
        entity: 'AuditLog',
        userId: auth.user.id,
        details: {
          format,
          startDate,
          endDate,
          entity,
          action,
          userId,
          fileHash,
          recordCount: format === 'json' ? JSON.parse(data).length : data.split('\n').length - 1,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        dataClassification: 'confidential',
        containsPII: true,
      },
    });

    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-File-Hash': fileHash,
      },
    });
  } catch (error) {
    console.error('Audit export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}