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

    interface Pattern {
      type: string;
      severity: 'high' | 'medium' | 'low';
      [key: string]: unknown;
    }

    interface AnalyticsResult {
      suspiciousPatterns?: Pattern[];
      anomalies?: unknown[];
      [key: string]: unknown;
    }

    // Record metrics for suspicious patterns (if they exist)
    const patterns = (analytics as AnalyticsResult).suspiciousPatterns || [];
    patterns.forEach((pattern: Pattern) => {
      recordSuspiciousPattern(pattern.type, pattern.severity);
    });

    return NextResponse.json({
      patterns: patterns,
      anomalies: (analytics as AnalyticsResult).anomalies || [],
      summary: {
        totalPatterns: patterns.length,
        highSeverity: patterns.filter((p: Pattern) => p.severity === 'high').length,
        mediumSeverity: patterns.filter((p: Pattern) => p.severity === 'medium').length,
        lowSeverity: patterns.filter((p: Pattern) => p.severity === 'low').length,
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
