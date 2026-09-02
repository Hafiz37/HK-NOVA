import prisma from '@/lib/prisma';
import type { AuditLog } from '@prisma/client';

export interface AuditAnalytics {
  totalLogs: number;
  byAction: Record<string, number>;
  byEntity: Record<string, number>;
  byUser: Array<{ userId: string; username: string; fullName: string | null; count: number }>;
  byHour: Array<{ hour: number; count: number }>;
  topIPs: Array<{ ip: string; country: string | null; count: number }>;
  failedAttempts: { count: number; topUsers: Array<{ userId: string; count: number }>; topIPs: Array<{ ip: string; count: number }> };
  suspiciousActivities: Array<{ type: string; count: number; severity: string }>;
  dateRange: { start: Date; end: Date };
}

export interface AnomalousAccess {
  userId: string;
  username: string;
  fullName: string | null;
  anomalyType: 'unusual_hour' | 'unusual_resource' | 'spike' | 'failed_pattern' | 'impossible_travel';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
  score: number;
  timestamp: Date;
}

interface UserMini {
  id: string;
  username: string;
  fullName: string | null;
}

interface LogWithUser extends AuditLog {
  user: UserMini | null;
}

async function findAuditLogsWithUser(where: any): Promise<LogWithUser[]> {
  const logs = await prisma.auditLog.findMany({ where });
  
  // Get unique user IDs
  const userIds = [...new Set(logs.map(log => log.userId).filter(Boolean))] as string[];
  
  // Fetch users
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, fullName: true }
  });
  
  const userMap = new Map(users.map(u => [u.id, u]));
  
  // Combine logs with user data
  return logs.map(log => ({
    ...log,
    user: log.userId ? userMap.get(log.userId) || null : null
  })) as LogWithUser[];
}

export async function getAuditAnalytics(
  startDate: Date,
  endDate: Date
): Promise<AuditAnalytics> {
  const logs = await findAuditLogsWithUser({ createdAt: { gte: startDate, lte: endDate } });

  const byAction: Record<string, number> = {};
  const byEntity: Record<string, number> = {};
  const userCounts: Record<string, { count: number; username: string; fullName: string | null }> = {};
  const hourCounts: Record<number, number> = {};
  const ipCounts: Record<string, { count: number; country: string | null }> = {};
  let failedCount = 0;
  const failedUserCounts: Record<string, number> = {};
  const failedIpCounts: Record<string, number> = {};

  for (const log of logs) {
    byAction[log.action] = (byAction[log.action] || 0) + 1;
    byEntity[log.entity] = (byEntity[log.entity] || 0) + 1;

    const hour = log.createdAt.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;

    if (log.userId) {
      const key = log.userId;
      if (!userCounts[key]) userCounts[key] = { count: 0, username: log.user?.username || '', fullName: log.user?.fullName || null };
      userCounts[key].count++;
    }

    if (log.ipAddress) {
      const ipKey = log.ipAddress;
      const ipCountry = (log.details as any)?.ipGeolocation?.country || null;
      if (!ipCounts[ipKey]) ipCounts[ipKey] = { count: 0, country: ipCountry };
      ipCounts[ipKey].count++;
    }

    if (log.action === 'LOGIN' && log.details) {
      const details = log.details as any;
      if (details.statusCode === 401 || details.errorMessage) {
        failedCount++;
        if (log.userId) failedUserCounts[log.userId] = (failedUserCounts[log.userId] || 0) + 1;
        if (log.ipAddress) failedIpCounts[log.ipAddress] = (failedIpCounts[log.ipAddress] || 0) + 1;
      }
    }
  }

  const byUser = Object.entries(userCounts)
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const byHour = Object.entries(hourCounts)
    .map(([hour, count]) => ({ hour: parseInt(hour, 10), count }))
    .sort((a, b) => a.hour - b.hour);

  const topIPs = Object.entries(ipCounts)
    .map(([ip, data]) => ({ ip, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const failedTopUsers = Object.entries(failedUserCounts)
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const failedTopIPs = Object.entries(failedIpCounts)
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const suspiciousActivities = await detectSuspiciousPatterns(startDate, endDate);

  return {
    totalLogs: logs.length,
    byAction,
    byEntity,
    byUser,
    byHour,
    topIPs,
    failedAttempts: { count: failedCount, topUsers: failedTopUsers, topIPs: failedTopIPs },
    suspiciousActivities,
    dateRange: { start: startDate, end: endDate },
  };
}

async function detectSuspiciousPatterns(
  startDate: Date,
  endDate: Date
): Promise<Array<{ type: string; count: number; severity: string }>> {
  const patterns: Array<{ type: string; count: number; severity: string }> = [];

  // Get all login attempts and filter failed ones in application code
  const loginLogs = await prisma.auditLog.findMany({
    where: { action: 'LOGIN', createdAt: { gte: startDate, lte: endDate } },
    select: { details: true }
  });
  
  const failedLogins = loginLogs.filter(log => {
    const details = log.details as any;
    return details?.statusCode === 401 || details?.errorMessage;
  }).length;
  
  if (failedLogins > 100) patterns.push({ type: 'high_failed_logins', count: failedLogins, severity: 'high' });
  else if (failedLogins > 50) patterns.push({ type: 'elevated_failed_logins', count: failedLogins, severity: 'medium' });

  const bulkDeletes = await prisma.auditLog.count({
    where: { action: 'DELETE', createdAt: { gte: startDate, lte: endDate } },
  });
  if (bulkDeletes > 20) patterns.push({ type: 'bulk_deletions', count: bulkDeletes, severity: 'high' });
  else if (bulkDeletes > 10) patterns.push({ type: 'multiple_deletions', count: bulkDeletes, severity: 'medium' });

  const exports = await prisma.auditLog.count({
    where: { action: 'EXPORT', createdAt: { gte: startDate, lte: endDate } },
  });
  if (exports > 10) patterns.push({ type: 'data_exports', count: exports, severity: 'medium' });

  const privilegeEscalations = await prisma.auditLog.count({
    where: { action: 'UPDATE', entity: 'User', createdAt: { gte: startDate, lte: endDate } },
  });
  if (privilegeEscalations > 5) patterns.push({ type: 'role_changes', count: privilegeEscalations, severity: 'high' });

  return patterns;
}

export async function detectAnomalousAccess(userId: string, timeRangeDays = 30): Promise<AnomalousAccess[]> {
  const startDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);
  const anomalies: AnomalousAccess[] = [];

  const userLogsRaw = await prisma.auditLog.findMany({
    where: { userId, createdAt: { gte: startDate } },
    orderBy: { createdAt: 'asc' },
  });

  const userLogs = userLogsRaw as unknown as LogWithUser[];

  if (userLogs.length < 10) return anomalies;

  const hourDistribution: Record<number, number> = {};
  const entityAccess: Record<string, number> = {};
  const dailyCounts: Record<string, number> = {};

  for (const log of userLogs) {
    const hour = log.createdAt.getHours();
    hourDistribution[hour] = (hourDistribution[hour] || 0) + 1;

    entityAccess[log.entity] = (entityAccess[log.entity] || 0) + 1;

    const dayKey = log.createdAt.toISOString().split('T')[0];
    dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
  }

  const avgHourlyAccess = Object.values(hourDistribution).reduce((a, b) => a + b, 0) / Object.keys(hourDistribution).length;
  const unusualHours = Object.entries(hourDistribution).filter(([_, count]) => count > avgHourlyAccess * 3);
  if (unusualHours.length > 0) {
    anomalies.push({
      userId,
      username: '',
      fullName: null,
      anomalyType: 'unusual_hour',
      severity: 'medium',
      details: { hours: unusualHours.map(([h]) => parseInt(h, 10)) },
      score: 60,
      timestamp: new Date(),
    });
  }

  const avgDailyAccess = Object.values(dailyCounts).reduce((a, b) => a + b, 0) / Object.keys(dailyCounts).length;
  const spikeDays = Object.entries(dailyCounts).filter(([_, count]) => count > avgDailyAccess * 5);
  if (spikeDays.length > 0) {
    anomalies.push({
      userId,
      username: '',
      fullName: null,
      anomalyType: 'spike',
      severity: 'high',
      details: { days: spikeDays },
      score: 80,
      timestamp: new Date(),
    });
  }

  const failedLogins = userLogs.filter((l) => l.action === 'LOGIN' && l.details && (l.details as any).statusCode === 401).length;
  if (failedLogins > userLogs.length * 0.3) {
    anomalies.push({
      userId,
      username: '',
      fullName: null,
      anomalyType: 'failed_pattern',
      severity: 'high',
      details: { failedCount: failedLogins, totalLogins: userLogs.filter((l) => l.action === 'LOGIN').length },
      score: 85,
      timestamp: new Date(),
    });
  }

  const sensitiveEntities = ['User', 'Setting', 'Backup', 'ApiKey'];
  const sensitiveAccess = userLogs.filter((l) => sensitiveEntities.includes(l.entity) && ['DELETE', 'UPDATE', 'EXPORT'].includes(l.action)).length;
  if (sensitiveAccess > 5) {
    anomalies.push({
      userId,
      username: '',
      fullName: null,
      anomalyType: 'unusual_resource',
      severity: 'high',
      details: { sensitiveAccessCount: sensitiveAccess },
      score: 75,
      timestamp: new Date(),
    });
  }

  return anomalies;
}

export async function getTopUsers(metric: 'total' | 'creates' | 'updates' | 'deletes' | 'exports' | 'logins', limit = 10, timeRangeDays = 30): Promise<Array<{ userId: string; username: string; fullName: string | null; count: number }>> {
  const startDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);
  const where: any = { createdAt: { gte: startDate } };

  switch (metric) {
    case 'creates': where.action = 'CREATE'; break;
    case 'updates': where.action = 'UPDATE'; break;
    case 'deletes': where.action = 'DELETE'; break;
    case 'exports': where.action = 'EXPORT'; break;
    case 'logins': where.action = 'LOGIN'; break;
  }

  const logs = await findAuditLogsWithUser(where);

  const counts: Record<string, { count: number; username: string; fullName: string | null }> = {};
  for (const log of logs) {
    if (!log.userId) continue;
    const key = log.userId;
    if (!counts[key]) counts[key] = { count: 0, username: log.user?.username || '', fullName: log.user?.fullName || null };
    counts[key].count++;
  }

  return Object.entries(counts)
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function getFailedAccessAttempts(timeRangeDays = 30): Promise<{ total: number; byUser: Array<{ userId: string; count: number }>; byIP: Array<{ ip: string; count: number }> }> {
  const startDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);
  const logs = await prisma.auditLog.findMany({
    where: {
      action: 'LOGIN',
      createdAt: { gte: startDate },
    },
    select: { userId: true, ipAddress: true, details: true },
  });

  // Filter failed logins in application code
  const failedLogs = logs.filter(log => {
    const details = log.details as any;
    return details?.statusCode === 401 || details?.errorMessage;
  });

  const byUser: Record<string, number> = {};
  const byIP: Record<string, number> = {};

  for (const log of failedLogs) {
    if (log.userId) byUser[log.userId] = (byUser[log.userId] || 0) + 1;
    if (log.ipAddress) byIP[log.ipAddress] = (byIP[log.ipAddress] || 0) + 1;
  }

  return {
    total: failedLogs.length,
    byUser: Object.entries(byUser).map(([userId, count]) => ({ userId, count })).sort((a, b) => b.count - a.count),
    byIP: Object.entries(byIP).map(([ip, count]) => ({ ip, count })).sort((a, b) => b.count - a.count),
  };
}

export async function getDataExports(timeRangeDays = 30): Promise<Array<{ userId: string; username: string; entity: string; entityId: string | null; timestamp: Date; ipAddress: string | null }>> {
  const startDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);
  const logs = await findAuditLogsWithUser({ action: 'EXPORT', createdAt: { gte: startDate } });

  return logs.map((log) => ({
    userId: log.userId || '',
    username: log.user?.username || 'unknown',
    entity: log.entity,
    entityId: log.entityId,
    timestamp: log.createdAt,
    ipAddress: log.ipAddress,
  }));
}

export async function getPrivilegedOperations(timeRangeDays = 30): Promise<Array<{ userId: string; username: string; action: string; entity: string; entityId: string | null; timestamp: Date }>> {
  const startDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);
  const privilegedActions = ['CREATE', 'UPDATE', 'DELETE'];
  const privilegedEntities = ['User', 'Setting', 'AlertRule', 'ApiKey', 'MaintenanceWindow', 'Backup'];

  const logs = await findAuditLogsWithUser({
    action: { in: privilegedActions },
    entity: { in: privilegedEntities },
    createdAt: { gte: startDate },
  });

  return logs.map((log) => ({
    userId: log.userId || '',
    username: log.user?.username || 'unknown',
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    timestamp: log.createdAt,
  }));
}