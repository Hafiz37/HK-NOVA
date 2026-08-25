import prisma from '@/lib/prisma';

export interface LoginHistoryEntry {
  id: string;
  userId: string;
  success: boolean;
  timestamp: Date;
  deviceFingerprint: string;
  deviceName: string | null;
  ipAddress: string;
  country: string | null;
  city: string | null;
  isNewDevice: boolean;
  isNewLocation: boolean;
  isSuspicious: boolean;
  riskScore: number | null;
  failureReason: string | null;
  sessionId: string | null;
}

export interface LoginStatistics {
  totalLogins: number;
  successRate: number;
  uniqueDevices: number;
  uniqueLocations: number;
  uniqueCountries: number;
  byCountry: Record<string, number>;
  byDevice: Record<string, number>;
  recentActivity: Array<{ date: string; logins: number; failures: number }>;
}

export async function recordLogin(
  userId: string,
  success: boolean,
  metadata: {
    deviceFingerprint: string;
    deviceName: string | null;
    ipAddress: string;
    country: string | null;
    city: string | null;
    failureReason?: string;
    sessionId?: string;
  }
): Promise<LoginHistoryEntry> {
  const priorLogins = await prisma.loginHistory.findMany({
    where: { userId },
    select: { deviceFingerprint: true, country: true, city: true },
    take: 100,
  });

  const isNewDevice = !priorLogins.some((l) => l.deviceFingerprint === metadata.deviceFingerprint);
  const isNewLocation =
    metadata.country != null && !priorLogins.some((l) => l.country === metadata.country);
  const riskScore = calculateLoginRiskScore(userId, metadata, isNewDevice, isNewLocation);

  const entry = await prisma.loginHistory.create({
    data: {
      userId,
      success,
      deviceFingerprint: metadata.deviceFingerprint,
      deviceName: metadata.deviceName,
      ipAddress: metadata.ipAddress,
      country: metadata.country,
      city: metadata.city,
      isNewDevice,
      isNewLocation,
      isSuspicious: isNewDevice && isNewLocation,
      riskScore,
      failureReason: metadata.failureReason || null,
      sessionId: metadata.sessionId || null,
    },
  });

  if (!success) {
    await recordSecurityEvent(userId, 'failed_login', 'medium', `Failed login attempt from ${metadata.ipAddress}`, {
      ipAddress: metadata.ipAddress,
      deviceFingerprint: metadata.deviceFingerprint,
      country: metadata.country,
      failureReason: metadata.failureReason,
    });
  } else if (isNewDevice) {
    await recordSecurityEvent(userId, 'new_device_login', 'high', `New device login: ${metadata.deviceName}`, {
      ipAddress: metadata.ipAddress,
      deviceName: metadata.deviceName,
      country: metadata.country,
      city: metadata.city,
    });
  } else if (isNewLocation) {
    await recordSecurityEvent(userId, 'new_location_login', 'medium', `New location login: ${metadata.city}, ${metadata.country}`, {
      ipAddress: metadata.ipAddress,
      country: metadata.country,
      city: metadata.city,
    });
  }

  return entry;
}

function calculateLoginRiskScore(
  userId: string,
  metadata: { ipAddress: string; country: string | null; city: string | null; deviceFingerprint: string },
  isNewDevice: boolean,
  isNewLocation: boolean
): number {
  let score = 0;

  if (isNewDevice) score += 30;
  if (isNewLocation) score += 25;

  return Math.min(score, 100);
}

export async function getLoginHistory(
  userId: string,
  limit = 50,
  offset = 0,
  filters?: { success?: boolean; dateFrom?: Date; dateTo?: Date }
): Promise<{ data: LoginHistoryEntry[]; total: number }> {
  const where: any = { userId };
  if (filters?.success !== undefined) where.success = filters.success;
  if (filters?.dateFrom || filters?.dateTo) {
    where.timestamp = {};
    if (filters?.dateFrom) where.timestamp.gte = filters.dateFrom;
    if (filters?.dateTo) where.timestamp.lte = filters.dateTo;
  }

  const [data, total] = await Promise.all([
    prisma.loginHistory.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.loginHistory.count({ where }),
  ]);

  return { data, total };
}

export async function getLoginStatistics(userId: string, timeRangeDays = 30): Promise<LoginStatistics> {
  const startDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);
  const logins = await prisma.loginHistory.findMany({
    where: { userId, timestamp: { gte: startDate } },
  });

  const totalLogins = logins.length;
  const successCount = logins.filter((l) => l.success).length;
  const successRate = totalLogins > 0 ? (successCount / totalLogins) * 100 : 0;

  const uniqueDevices = new Set(logins.map((l) => l.deviceFingerprint)).size;
  const uniqueLocations = new Set(logins.map((l) => `${l.country}-${l.city}`)).size;
  const uniqueCountries = new Set(logins.map((l) => l.country).filter(Boolean)).size;

  const byCountry: Record<string, number> = {};
  const byDevice: Record<string, number> = {};
  const dailyCounts: Record<string, { logins: number; failures: number }> = {};

  for (const login of logins) {
    const country = login.country || 'Unknown';
    byCountry[country] = (byCountry[country] || 0) + 1;

    const device = login.deviceName || 'Unknown';
    byDevice[device] = (byDevice[device] || 0) + 1;

    const dayKey = login.timestamp.toISOString().split('T')[0];
    if (!dailyCounts[dayKey]) dailyCounts[dayKey] = { logins: 0, failures: 0 };
    dailyCounts[dayKey].logins++;
    if (!login.success) dailyCounts[dayKey].failures++;
  }

  const recentActivity = Object.entries(dailyCounts)
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  return {
    totalLogins,
    successRate: Math.round(successRate * 100) / 100,
    uniqueDevices,
    uniqueLocations,
    uniqueCountries,
    byCountry,
    byDevice,
    recentActivity,
  };
}

export async function detectNewDevice(userId: string, deviceFingerprint: string): Promise<boolean> {
  const existing = await prisma.loginHistory.findFirst({
    where: { userId, deviceFingerprint },
    select: { id: true },
  });
  return !existing;
}

export async function detectNewLocation(userId: string, country: string | null, city: string | null): Promise<boolean> {
  if (!country) return false;
  const existing = await prisma.loginHistory.findFirst({
    where: { userId, country, city },
    select: { id: true },
  });
  return !existing;
}

async function recordSecurityEvent(
  userId: string,
  eventType: string,
  severity: string,
  description: string,
  metadata: any
): Promise<void> {
  await prisma.securityEvent.create({
    data: {
      userId,
      eventType,
      severity,
      description,
      metadata,
      ipAddress: metadata.ipAddress,
    },
  });

  await prisma.securityTimeline.create({
    data: {
      userId,
      eventType,
      severity,
      title: description.split('\n')[0],
      description,
      metadata,
      ipAddress: metadata.ipAddress,
      deviceName: metadata.deviceName,
      location: metadata.city && metadata.country ? `${metadata.city}, ${metadata.country}` : metadata.country || null,
    },
  });
}

export async function getRecentLogins(userId: string, hours = 24): Promise<LoginHistoryEntry[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return prisma.loginHistory.findMany({
    where: { userId, timestamp: { gte: since } },
    orderBy: { timestamp: 'desc' },
  });
}