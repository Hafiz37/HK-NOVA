import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { generateComplianceReport, checkComplianceRequirements, getComplianceGaps } from '@/lib/audit/compliance';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const reports = await prisma.complianceReport.findMany({
      orderBy: { generatedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ data: reports });
  } catch (error) {
    console.error('Get compliance reports error:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { standard, startDate, endDate, reportType = 'comprehensive' } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const report = await generateComplianceReport(
      standard || 'custom',
      new Date(startDate),
      new Date(endDate),
      auth.user.id
    );

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Generate compliance report error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}