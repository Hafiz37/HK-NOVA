import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { verifyAuditChain } from '@/lib/audit/immutable-log';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { startSequence, endSequence, startDate, endDate } = body;

    let startSeq = startSequence ? BigInt(startSequence) : BigInt(0);
    let endSeq = endSequence ? BigInt(endSequence) : BigInt(Number.MAX_SAFE_INTEGER);

    if (startDate && endDate) {
      const logs = await prisma.auditLog.findMany({
        where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } },
        select: { sequenceNumber: true },
        orderBy: { sequenceNumber: 'asc' },
        take: 1,
      });
      if (logs.length > 0) startSeq = logs[0].sequenceNumber;

      const logsEnd = await prisma.auditLog.findMany({
        where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } },
        select: { sequenceNumber: true },
        orderBy: { sequenceNumber: 'desc' },
        take: 1,
      });
      if (logsEnd.length > 0) endSeq = logsEnd[0].sequenceNumber;
    }

    const result = await verifyAuditChain(Number(startSeq), Number(endSeq));

    await prisma.auditLog.create({
      data: {
        action: 'VERIFY',
        entity: 'AuditLog',
        userId: auth.user.id,
        details: {
          startSequence: startSeq.toString(),
          endSequence: endSeq.toString(),
          verified: result.valid,
          errorCount: result.errors.length,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      },
    });

    return NextResponse.json({
      valid: result.valid,
      checkedRange: { start: startSeq.toString(), end: endSeq.toString() },
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Audit verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}