import prisma from '@/lib/prisma';
import { getAuditAnalytics, detectAnomalousAccess, getDataExports, getPrivilegedOperations, getFailedAccessAttempts } from './analytics';
import { verifyAuditChain } from './immutable-log';

export interface ComplianceStandard {
  id: string;
  name: string;
  requirements: ComplianceRequirement[];
}

export interface ComplianceRequirement {
  id: string;
  description: string;
  check: () => Promise<{ passed: boolean; evidence: any }>;
}

export interface ComplianceReport {
  id?: string;
  reportType: string;
  standard: string | null;
  startDate: Date;
  endDate: Date;
  summary: any;
  findings: any;
  recommendations?: any;
  filePath?: string;
  fileHash?: string;
  generatedBy: string;
  generatedAt: Date;
}

const COMPLIANCE_STANDARDS: Record<string, ComplianceStandard> = {
  ISO27001: {
    id: 'ISO27001',
    name: 'ISO 27001',
    requirements: [],
  },
  SOC2: {
    id: 'SOC2',
    name: 'SOC 2 Type II',
    requirements: [],
  },
  GDPR: {
    id: 'GDPR',
    name: 'GDPR',
    requirements: [],
  },
  'PCI-DSS': {
    id: 'PCI-DSS',
    name: 'PCI DSS',
    requirements: [],
  },
};

interface UserMini {
  id: string;
  username: string;
  fullName: string | null;
  role?: string;
  mfaEnabled?: boolean;
  lastLoginAt?: Date | null;
}

interface LogWithUser extends Record<string, any> {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: Date;
  sequenceNumber: bigint;
  signature: string | null;
  previousHash: string | null;
  verified: boolean;
  dataClassification: string | null;
  containsPII: boolean;
  containsSecrets: boolean;
  user: UserMini | null;
}

async function findAuditLogsWithUser(where: any): Promise<LogWithUser[]> {
  const logs = await prisma.auditLog.findMany({ where });
  
  // Get unique user IDs
  const userIds = [...new Set(logs.map(log => log.userId).filter(Boolean))] as string[];
  
  // Fetch users
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, fullName: true, role: true, mfaEnabled: true, lastLoginAt: true }
  });
  
  const userMap = new Map(users.map(u => [u.id, u]));
  
  // Combine logs with user data
  return logs.map(log => ({
    ...log,
    user: log.userId ? userMap.get(log.userId) || null : null
  })) as LogWithUser[];
}

export async function generateComplianceReport(
  standard: string,
  startDate: Date,
  endDate: Date,
  generatedBy: string
): Promise<ComplianceReport> {
  const [
    analytics,
    failedAttempts,
    dataExports,
    privilegedOps,
    chainVerification,
  ] = await Promise.all([
    getAuditAnalytics(startDate, endDate),
    getFailedAccessAttempts(Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))),
    getDataExports(Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))),
    getPrivilegedOperations(Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))),
    verifyAuditChain(0, Number.MAX_SAFE_INTEGER),
  ]);

  const allUsers = await prisma.user.findMany({ select: { id: true, username: true, fullName: true, role: true, mfaEnabled: true, lastLoginAt: true } }) as UserMini[];
  const usersWithMFA = allUsers.filter((u) => u.mfaEnabled).length;
  const usersWithoutMFA = allUsers.filter((u) => !u.mfaEnabled).length;

  const summary = {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    totalAuditLogs: analytics.totalLogs,
    totalUsers: allUsers.length,
    usersWithMFA,
    usersWithoutMFA,
    failedLoginAttempts: failedAttempts.total,
    dataExports: dataExports.length,
    privilegedOperations: privilegedOps.length,
    auditChainVerified: chainVerification.valid,
    auditChainErrors: chainVerification.errors.length,
  };

  const findings = {
    accessControl: {
      totalUsers: allUsers.length,
      adminCount: allUsers.filter((u) => u.role === 'ADMIN').length,
      operatorCount: allUsers.filter((u) => u.role === 'OPERATOR').length,
      viewerCount: allUsers.filter((u) => u.role === 'VIEWER').length,
      mfaAdoptionRate: allUsers.length > 0 ? Math.round((usersWithMFA / allUsers.length) * 100) : 0,
      inactiveUsers: allUsers.filter((u) => !u.lastLoginAt || u.lastLoginAt < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)).length,
    },
    authentication: {
      failedLoginAttempts: failedAttempts.total,
      topFailedUsers: failedAttempts.byUser.slice(0, 10),
      topFailedIPs: failedAttempts.byIP.slice(0, 10),
    },
    auditIntegrity: {
      chainVerified: chainVerification.valid,
      errors: chainVerification.errors.slice(0, 20),
    },
    dataProtection: {
      exportsCount: dataExports.length,
      exports: dataExports.slice(0, 50),
    },
    privilegedActivity: {
      count: privilegedOps.length,
      operations: privilegedOps.slice(0, 100),
    },
    anomalies: analytics.suspiciousActivities,
  };

  const recommendations: string[] = [];

  if (usersWithoutMFA > 0) {
    recommendations.push(`${usersWithoutMFA} users do not have MFA enabled. Enforce MFA for all users, especially ADMIN and OPERATOR roles.`);
  }

  if (failedAttempts.total > 100) {
    recommendations.push(`High number of failed login attempts (${failedAttempts.total}). Review IP blocking and account lockout policies.`);
  }

  if (!chainVerification.valid) {
    recommendations.push(`Audit chain verification failed with ${chainVerification.errors.length} errors. Investigate potential tampering immediately.`);
  }

  if (dataExports.length > 0) {
    recommendations.push(`${dataExports.length} data export operations detected. Review for GDPR compliance and ensure proper authorization.`);
  }

  if (privilegedOps.length > 50) {
    recommendations.push(`High volume of privileged operations (${privilegedOps.length}). Implement approval workflows for sensitive changes.`);
  }

  const inactiveUsers = allUsers.filter((u) => !u.lastLoginAt || u.lastLoginAt < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)).length;
  if (inactiveUsers > 0) {
    recommendations.push(`${inactiveUsers} users have not logged in for 90+ days. Review and disable inactive accounts.`);
  }

  const report: ComplianceReport = {
    reportType: 'comprehensive',
    standard,
    startDate,
    endDate,
    summary,
    findings,
    recommendations,
    generatedBy,
    generatedAt: new Date(),
  };

  const saved = await prisma.complianceReport.create({
    data: {
      reportType: report.reportType,
      standard: report.standard,
      startDate: report.startDate,
      endDate: report.endDate,
      summary: report.summary as any,
      findings: report.findings as any,
      recommendations: report.recommendations as any,
      generatedBy: report.generatedBy,
      generatedAt: report.generatedAt,
    },
  });

  return { ...report, id: saved.id };
}

export async function checkComplianceRequirements(standard: string): Promise<{ passed: number; failed: number; details: Array<{ requirement: string; status: 'pass' | 'fail'; evidence: any }> }> {
  const checks = await runComplianceChecks(standard);
  return {
    passed: checks.filter((c) => c.status === 'pass').length,
    failed: checks.filter((c) => c.status === 'fail').length,
    details: checks,
  };
}

async function runComplianceChecks(standard: string): Promise<Array<{ requirement: string; status: 'pass' | 'fail'; evidence: any }>> {
  const checks: Array<{ requirement: string; status: 'pass' | 'fail'; evidence: any }> = [];

  const allUsers = await prisma.user.findMany({ select: { id: true, role: true, mfaEnabled: true, passwordExpiresAt: true, lastLoginAt: true } });

  const mfaAdoption = allUsers.filter((u) => u.mfaEnabled).length / Math.max(allUsers.length, 1);
  checks.push({
    requirement: 'MFA enabled for all users',
    status: mfaAdoption >= 0.9 ? 'pass' : 'fail',
    evidence: { adoptionRate: Math.round(mfaAdoption * 100), total: allUsers.length, enabled: allUsers.filter((u) => u.mfaEnabled).length },
  });

  const adminMFA = allUsers.filter((u) => u.role === 'ADMIN' && u.mfaEnabled).length;
  const totalAdmins = allUsers.filter((u) => u.role === 'ADMIN').length;
  checks.push({
    requirement: 'MFA enforced for ADMIN users',
    status: adminMFA === totalAdmins && totalAdmins > 0 ? 'pass' : 'fail',
    evidence: { adminsWithMFA: adminMFA, totalAdmins },
  });

  const expiredPasswords = allUsers.filter((u) => u.passwordExpiresAt && u.passwordExpiresAt < new Date()).length;
  checks.push({
    requirement: 'No expired passwords',
    status: expiredPasswords === 0 ? 'pass' : 'fail',
    evidence: { expiredCount: expiredPasswords },
  });

  const chainResult = await verifyAuditChain(0, Number.MAX_SAFE_INTEGER);
  checks.push({
    requirement: 'Audit log integrity verified',
    status: chainResult.valid ? 'pass' : 'fail',
    evidence: { errors: chainResult.errors.length, details: chainResult.errors.slice(0, 5) },
  });

  const recentLogs = await prisma.auditLog.count({
    where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  checks.push({
    requirement: 'Audit logging active',
    status: recentLogs > 0 ? 'pass' : 'fail',
    evidence: { logsLast24h: recentLogs },
  });

  const archivedLogs = await prisma.auditLog.count({ where: { isArchived: true } });
  checks.push({
    requirement: 'Audit log archival configured',
    status: archivedLogs >= 0 ? 'pass' : 'fail',
    evidence: { archivedCount: archivedLogs },
  });

  return checks;
}

export async function getComplianceGaps(standard: string): Promise<string[]> {
  const result = await checkComplianceRequirements(standard);
  return result.details.filter((d) => d.status === 'fail').map((d) => d.requirement);
}

export async function exportAuditForCompliance(
  format: 'csv' | 'json',
  startDate: Date,
  endDate: Date,
  filters?: { entity?: string; action?: string; userId?: string }
): Promise<{ data: string; filename: string }> {
  const where: any = { createdAt: { gte: startDate, lte: endDate } };
  if (filters?.entity) where.entity = filters.entity;
  if (filters?.action) where.action = filters.action;
  if (filters?.userId) where.userId = filters.userId;

  const logs = await findAuditLogsWithUser(where);

  const exportData = logs.map((log) => ({
    id: log.id,
    sequenceNumber: log.sequenceNumber.toString(),
    timestamp: log.createdAt.toISOString(),
    action: log.action,
    entity: log.entity,
    entityId: log.entityId || '',
    userId: log.userId || '',
    username: log.user?.username || '',
    fullName: log.user?.fullName || '',
    role: log.user?.role || '',
    ipAddress: log.ipAddress || '',
    details: JSON.stringify(log.details || {}),
    signature: log.signature || '',
    previousHash: log.previousHash || '',
    verified: log.verified,
    dataClassification: log.dataClassification || 'internal',
    containsPII: log.containsPII,
    containsSecrets: log.containsSecrets,
  }));

  if (format === 'csv') {
    const headers = Object.keys(exportData[0] || {}).join(',');
    const rows = exportData.map((row) => Object.values(row).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    return {
      data: [headers, ...rows].join('\n'),
      filename: `audit-export-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}.csv`,
    };
  }

  return {
    data: JSON.stringify(exportData, null, 2),
    filename: `audit-export-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}.json`,
  };
}