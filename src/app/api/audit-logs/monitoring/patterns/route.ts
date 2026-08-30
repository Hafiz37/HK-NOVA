import { NextRequest, NextResponse } from 'next/server';
import { getAuditAnalytics } from '@/lib/audit/analytics';
import { recordSuspiciousPattern } from '@/lib/metrics';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24');

    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const endDate = new Date();

    const analytics = await getAuditAnalytics(startDate, endDate);

    // Record metrics for suspicious patterns (if they exist)
    const patterns = (analytics as any).suspiciousPatterns || [];
    patterns.forEach((pattern: any) => {
      recordSuspiciousPattern(pattern.type, pattern.severity);
    });

    return NextResponse.json({
      patterns: patterns,
      anomalies: (analytics as any).anomalies || [],
      summary: {
        totalPatterns: patterns.length,
        highSeverity: patterns.filter((p: any) => p.severity === 'high').length,
        mediumSeverity: patterns.filter((p: any) => p.severity === 'medium').length,
        lowSeverity: patterns.filter((p: any) => p.severity === 'low').length,
      },
    });
  } catch (error) {
    console.error('Failed to get suspicious patterns:', error);
    return NextResponse.json(
      { error: 'Failed to analyze audit logs' },
      { status: 500 }
    );
  }
}
