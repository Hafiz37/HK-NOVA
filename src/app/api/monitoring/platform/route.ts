import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuditAnalytics } from '@/lib/audit/analytics';

export async function GET(request: NextRequest) {
  try {
    // Mock condition evaluation data (in production, this would come from metrics store)
    const conditionEvaluations = Array.from({ length: 12 }, (_, i) => ({
      timestamp: new Date(Date.now() - (11 - i) * 5 * 60000).toISOString().slice(11, 16),
      success: Math.floor(Math.random() * 100) + 50,
      failed: Math.floor(Math.random() * 10),
    }));

    // Rate limit violations (mock data - in production would track real violations)
    const rateLimitViolations = [
      {
        endpoint: 'login',
        count: 23,
        topIPs: [
          { ip: '192.168.1.100', count: 12 },
          { ip: '10.0.0.50', count: 11 },
        ],
      },
      {
        endpoint: 'export',
        count: 8,
        topIPs: [
          { ip: '172.16.0.10', count: 5 },
          { ip: '192.168.1.100', count: 3 },
        ],
      },
      {
        endpoint: 'mutation',
        count: 5,
        topIPs: [
          { ip: '10.0.0.50', count: 3 },
          { ip: '192.168.1.200', count: 2 },
        ],
      },
    ];

    // Get suspicious patterns from audit analytics
    const auditAnalytics = await getAuditAnalytics(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      new Date()
    );

    const patterns = (auditAnalytics as any).suspiciousPatterns || [];
    const suspiciousPatterns = patterns.map((pattern: any) => ({
      type: pattern.type,
      severity: pattern.severity,
      count: pattern.count,
      timestamp: new Date(pattern.lastSeen).toLocaleTimeString(),
    }));

    // Worker health status
    const workers = [
      'icmp-poller',
      'snmp-poller',
      'anomaly-detector',
      'alert-escalator',
      'backup-worker',
      'retention-worker',
    ];

    const workerHealth = await Promise.all(
      workers.map(async (workerName) => {
        // Get last metric timestamp as proxy for worker health
        const lastMetric = await prisma.metric.findFirst({
          orderBy: { timestamp: 'desc' },
          select: { timestamp: true },
        });

        const now = Date.now();
        const lastRun = lastMetric?.timestamp || new Date(now - 10 * 60000);
        const lag = Math.floor((now - lastRun.getTime()) / 1000);

        return {
          name: workerName,
          lastRun,
          lag,
          status: lag < 300 ? 'healthy' : lag < 600 ? 'warning' : 'error',
        };
      })
    );

    return NextResponse.json({
      conditionEvaluations,
      rateLimitViolations,
      suspiciousPatterns,
      workerHealth,
    });
  } catch (error) {
    console.error('Platform monitoring error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monitoring data' },
      { status: 500 }
    );
  }
}
