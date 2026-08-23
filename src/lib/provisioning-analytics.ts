import { PrismaClient, ProvisioningStatus, ExecutionMode } from '@prisma/client';

export interface ProvisioningStats {
  total: number;
  successCount: number;
  failedCount: number;
  dryRunCount: number;
  successRate: number;
  avgExecutionTimeMs: number;
  vendorStats: Array<{
    vendor: string;
    total: number;
    success: number;
    failed: number;
    successRate: number;
    avgTimeMs: number;
  }>;
  actionStats: Array<{
    action: string;
    total: number;
    success: number;
    failed: number;
  }>;
  recentTrend: Array<{
    date: string;
    total: number;
    success: number;
    failed: number;
    dryRun: number;
  }>;
}

export async function getProvisioningAnalytics(
  prisma: PrismaClient,
  days: number = 30
): Promise<ProvisioningStats> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const logs = await prisma.provisioningLog.findMany({
    where: {
      executedAt: { gte: startDate },
    },
    include: {
      device: { select: { vendor: true } },
    },
  });

  const total = logs.length;
  const successCount = logs.filter((l) => l.status === 'SUCCESS').length;
  const failedCount = logs.filter((l) => l.status === 'FAILED').length;
  const dryRunCount = logs.filter((l) => l.executionMode === 'DRY_RUN').length;

  const successRate = total > 0 ? Math.round((successCount / (total - dryRunCount || 1)) * 100) : 100;

  const logsWithTime = logs.filter((l) => l.executionTimeMs !== null && l.executionTimeMs > 0);
  const avgExecutionTimeMs =
    logsWithTime.length > 0
      ? Math.round(logsWithTime.reduce((sum, l) => sum + (l.executionTimeMs ?? 0), 0) / logsWithTime.length)
      : 0;

  // Stats by vendor
  const vendorMap = new Map<string, { total: number; success: number; failed: number; times: number[] }>();
  for (const log of logs) {
    const vendor = log.device?.vendor ?? 'Unknown';
    const entry = vendorMap.get(vendor) ?? { total: 0, success: 0, failed: 0, times: [] };
    entry.total++;
    if (log.status === 'SUCCESS') entry.success++;
    if (log.status === 'FAILED') entry.failed++;
    if (log.executionTimeMs) entry.times.push(log.executionTimeMs);
    vendorMap.set(vendor, entry);
  }

  const vendorStats = Array.from(vendorMap.entries()).map(([vendor, data]) => ({
    vendor,
    total: data.total,
    success: data.success,
    failed: data.failed,
    successRate: data.total > 0 ? Math.round((data.success / data.total) * 100) : 0,
    avgTimeMs: data.times.length > 0 ? Math.round(data.times.reduce((a, b) => a + b, 0) / data.times.length) : 0,
  }));

  // Stats by action
  const actionMap = new Map<string, { total: number; success: number; failed: number }>();
  for (const log of logs) {
    const action = log.action;
    const entry = actionMap.get(action) ?? { total: 0, success: 0, failed: 0 };
    entry.total++;
    if (log.status === 'SUCCESS') entry.success++;
    if (log.status === 'FAILED') entry.failed++;
    actionMap.set(action, entry);
  }

  const actionStats = Array.from(actionMap.entries()).map(([action, data]) => ({
    action,
    total: data.total,
    success: data.success,
    failed: data.failed,
  }));

  // Trend by date (last N days)
  const trendMap = new Map<string, { total: number; success: number; failed: number; dryRun: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    trendMap.set(dateStr, { total: 0, success: 0, failed: 0, dryRun: 0 });
  }

  for (const log of logs) {
    const dateStr = log.executedAt.toISOString().split('T')[0];
    const entry = trendMap.get(dateStr);
    if (entry) {
      entry.total++;
      if (log.status === 'SUCCESS') entry.success++;
      if (log.status === 'FAILED') entry.failed++;
      if (log.executionMode === 'DRY_RUN') entry.dryRun++;
    }
  }

  const recentTrend = Array.from(trendMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    total,
    successCount,
    failedCount,
    dryRunCount,
    successRate,
    avgExecutionTimeMs,
    vendorStats,
    actionStats,
    recentTrend,
  };
}