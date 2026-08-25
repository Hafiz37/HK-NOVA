import prisma from '@/lib/prisma';

export interface SecurityTimelineEvent {
  id: string;
  userId: string;
  eventType: string;
  severity: 'info' | 'warning' | 'high' | 'critical';
  title: string;
  description: string;
  metadata: any | null;
  ipAddress: string | null;
  deviceName: string | null;
  location: string | null;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
}

export interface SecurityTimelineResponse {
  data: SecurityTimelineEvent[];
  total: number;
  unacknowledgedCount: number;
}

function mapEvent(e: any): SecurityTimelineEvent {
  return {
    ...e,
    severity: e.severity as 'info' | 'warning' | 'high' | 'critical',
  };
}

export async function addTimelineEvent(
  userId: string,
  eventType: string,
  details: {
    title: string;
    description: string;
    severity?: 'info' | 'warning' | 'high' | 'critical';
    metadata?: any;
    ipAddress?: string;
    deviceName?: string;
    location?: string;
  }
): Promise<SecurityTimelineEvent> {
  const event = await prisma.securityTimeline.create({
    data: {
      userId,
      eventType,
      severity: details.severity || 'info',
      title: details.title,
      description: details.description,
      metadata: details.metadata,
      ipAddress: details.ipAddress || null,
      deviceName: details.deviceName || null,
      location: details.location || null,
    },
  });

  if (details.severity && ['high', 'critical'].includes(details.severity)) {
    await sendSecurityAlert(userId, mapEvent(event));
  }

  return mapEvent(event);
}

export async function getSecurityTimeline(
  userId: string,
  limit = 50,
  offset = 0,
  filters?: { severity?: string; acknowledged?: boolean }
): Promise<SecurityTimelineResponse> {
  const where: any = { userId };
  if (filters?.severity) where.severity = filters.severity;
  if (filters?.acknowledged !== undefined) where.acknowledged = filters.acknowledged;

  const [data, total, unacknowledgedCount] = await Promise.all([
    prisma.securityTimeline.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.securityTimeline.count({ where }),
    prisma.securityTimeline.count({ where: { userId, acknowledged: false } }),
  ]);

  return { data: data.map(mapEvent), total, unacknowledgedCount };
}

export async function acknowledgeEvent(userId: string, eventId: string): Promise<boolean> {
  const event = await prisma.securityTimeline.findFirst({
    where: { id: eventId, userId },
  });

  if (!event || event.acknowledged) return false;

  await prisma.securityTimeline.update({
    where: { id: eventId },
    data: { acknowledged: true, acknowledgedAt: new Date() },
  });

  return true;
}

export async function getUnacknowledgedEvents(userId: string): Promise<SecurityTimelineEvent[]> {
  const events = await prisma.securityTimeline.findMany({
    where: { userId, acknowledged: false },
    orderBy: { timestamp: 'desc' },
    take: 20,
  });
  return events.map(mapEvent);
}

export async function sendSecurityAlert(userId: string, event: SecurityTimelineEvent): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, fullName: true },
  });

  if (!user || !user.email) return;

  const shouldNotify =
    event.severity === 'critical' || event.severity === 'high';

  if (!shouldNotify) return;

  await prisma.notificationLog.create({
    data: {
      subscriptionId: 'security-alerts',
      event: event.eventType,
      entityType: 'SecurityTimeline',
      entityId: event.id,
      status: 'PENDING',
      payload: {
        type: 'security_alert',
        severity: event.severity,
        title: event.title,
        description: event.description,
        timestamp: event.timestamp.toISOString(),
        location: event.location,
        device: event.deviceName,
        ip: event.ipAddress,
      } as any,
    },
  });
}

export async function generateUserSecurityReport(userId: string): Promise<{
  user: { id: string; username: string; fullName: string | null; email: string | null; role: string; mfaEnabled: boolean };
  activeSessions: number;
  loginHistory: LoginHistorySummary;
  timeline: SecurityTimelineEvent[];
  riskScore: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, fullName: true, email: true, role: true, mfaEnabled: true },
  });

  if (!user) throw new Error('User not found');

  const [activeSessions, loginStats, timeline, recentLogins] = await Promise.all([
    prisma.userSession.count({ where: { userId, isActive: true, expiresAt: { gt: new Date() } } }),
    getLoginStatistics(userId, 30),
    getSecurityTimeline(userId, 20, 0),
    getRecentLogins(userId, 168),
  ]);

  const suspiciousCount = recentLogins.filter((l) => l.isSuspicious).length;
  const failedCount = recentLogins.filter((l) => !l.success).length;
  const newDeviceCount = recentLogins.filter((l) => l.isNewDevice).length;
  const newLocationCount = recentLogins.filter((l) => l.isNewLocation).length;

  let riskScore = 0;
  riskScore += suspiciousCount * 20;
  riskScore += failedCount * 10;
  riskScore += newDeviceCount * 15;
  riskScore += newLocationCount * 10;
  riskScore = Math.min(riskScore, 100);

  return {
    user,
    activeSessions,
    loginHistory: {
      totalLogins: loginStats.totalLogins,
      successRate: loginStats.successRate,
      uniqueDevices: loginStats.uniqueDevices,
      uniqueLocations: loginStats.uniqueLocations,
      uniqueCountries: loginStats.uniqueCountries,
      byCountry: loginStats.byCountry,
      byDevice: loginStats.byDevice,
      recentActivity: loginStats.recentActivity,
    },
    timeline: timeline.data,
    riskScore,
  };
}

interface LoginHistorySummary {
  totalLogins: number;
  successRate: number;
  uniqueDevices: number;
  uniqueLocations: number;
  uniqueCountries: number;
  byCountry: Record<string, number>;
  byDevice: Record<string, number>;
  recentActivity: Array<{ date: string; logins: number; failures: number }>;
}

import { getLoginStatistics, getRecentLogins } from './login-history';