import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { generateComplianceReport, generatePDFReport, generateExcelReport } from '@/lib/backup-compliance';

/**
 * GET /api/backups/report
 * Generate compliance report
 * 
 * Query params:
 * - startDate: ISO date string (required)
 * - endDate: ISO date string (required)
 * - deviceIds: comma-separated device IDs
 * - format: pdf | xlsx (default: pdf)
 * - includeDetails: boolean (default: true)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const format = (searchParams.get('format') || 'pdf') as 'pdf' | 'xlsx';
    const includeDetails = searchParams.get('includeDetails') !== 'false';
    const deviceIds = searchParams.get('deviceIds')?.split(',').filter(Boolean);

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { error: 'startDate and endDate are required (ISO format)' },
        { status: 400 }
      );
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    if (startDate > endDate) {
      return NextResponse.json({ error: 'startDate must be before endDate' }, { status: 400 });
    }

    // Generate report data
    const reportData = await generateComplianceReport(prisma, {
      startDate,
      endDate,
      deviceIds,
      format,
      includeDetails,
    });

    // Generate file
    let fileBuffer: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'pdf') {
      fileBuffer = await generatePDFReport(reportData);
      contentType = 'application/pdf';
      filename = `backup-compliance-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.pdf`;
    } else {
      fileBuffer = await generateExcelReport(reportData);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `backup-compliance-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.xlsx`;
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[API /api/backups/report] Error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}