import { PrismaClient } from '@prisma/client';
import { getBackupContent } from './backup-storage';

export interface SearchOptions {
  query: string;
  deviceIds?: string[];
  deviceTypes?: string[];
  vendors?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  caseSensitive?: boolean;
  useRegex?: boolean;
}

export interface SearchResult {
  backupId: string;
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  deviceType: string;
  vendor: string | null;
  timestamp: Date;
  matches: SearchMatch[];
  storageLocation: string;
}

export interface SearchMatch {
  lineNumber: number;
  line: string;
  contextBefore: string[];
  contextAfter: string[];
}

export interface SearchStats {
  totalBackupsSearched: number;
  totalMatches: number;
  devicesWithMatches: number;
  searchTimeMs: number;
}

/**
 * Search config content across backups
 * Supports regex and plain text search
 */
export async function searchBackups(
  prisma: PrismaClient,
  options: SearchOptions
): Promise<{ results: SearchResult[]; stats: SearchStats }> {
  const startTime = Date.now();
  const {
    query,
    deviceIds,
    deviceTypes,
    vendors,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
    caseSensitive = false,
    useRegex = false,
  } = options;

  // Build where clause for backups
  const where: any = {
    deletedAt: null,
    status: 'SUCCESS',
  };

  if (deviceIds && deviceIds.length > 0) {
    where.deviceId = { in: deviceIds };
  }

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp.gte = startDate;
    if (endDate) where.timestamp.lte = endDate;
  }

  // Get devices for filtering by type/vendor
  let deviceWhere: any = { deletedAt: null };
  if (deviceTypes && deviceTypes.length > 0) {
    deviceWhere.type = { in: deviceTypes };
  }
  if (vendors && vendors.length > 0) {
    deviceWhere.vendor = { in: vendors };
  }

  const deviceIdsFromFilter = deviceTypes || vendors
    ? (await prisma.device.findMany({
        where: deviceWhere,
        select: { id: true },
      })).map(d => d.id)
    : null;

  if (deviceIdsFromFilter) {
    where.deviceId = where.deviceId
      ? { in: where.deviceId.in.filter((id: string) => deviceIdsFromFilter.includes(id)) }
      : { in: deviceIdsFromFilter };
  }

  // Get backups to search
  const backups = await prisma.backup.findMany({
    where,
    select: {
      id: true,
      deviceId: true,
      timestamp: true,
      configContent: true,
      isCompressed: true,
      isEncrypted: true,
      storageLocation: true,
      filePath: true,
    },
    orderBy: { timestamp: 'desc' },
    take: limit + offset,
    skip: offset,
  });

  // Get device info
  const deviceIdsInResults = [...new Set(backups.map(b => b.deviceId))];
  const devices = await prisma.device.findMany({
    where: { id: { in: deviceIdsInResults } },
    select: { id: true, name: true, ip: true, type: true, vendor: true },
  });
  const deviceMap = new Map(devices.map(d => [d.id, d]));

  // Prepare regex
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = useRegex
    ? new RegExp(query, flags)
    : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

  // Search through backups
  const results: SearchResult[] = [];
  let totalMatches = 0;
  const devicesWithMatches = new Set<string>();

  for (const backup of backups) {
    try {
      const content = await getBackupContent({
        id: backup.id,
        configContent: backup.configContent as unknown as Buffer | null,
        storageLocation: backup.storageLocation,
        filePath: backup.filePath,
        isCompressed: backup.isCompressed,
        isEncrypted: backup.isEncrypted,
      });

      const lines = content.split('\n');
      const matches: SearchMatch[] = [];

      lines.forEach((line, lineIndex) => {
        if (regex.test(line)) {
          totalMatches++;
          devicesWithMatches.add(backup.deviceId);

          // Get context (2 lines before and after)
          const contextBefore = lines.slice(Math.max(0, lineIndex - 2), lineIndex);
          const contextAfter = lines.slice(lineIndex + 1, lineIndex + 3);

          matches.push({
            lineNumber: lineIndex + 1,
            line,
            contextBefore,
            contextAfter,
          });
        }
      });

      if (matches.length > 0) {
        const device = deviceMap.get(backup.deviceId);
        results.push({
          backupId: backup.id,
          deviceId: backup.deviceId,
          deviceName: device?.name ?? 'Unknown',
          deviceIp: device?.ip ?? 'Unknown',
          deviceType: device?.type ?? 'Unknown',
          vendor: device?.vendor ?? null,
          timestamp: backup.timestamp,
          matches,
          storageLocation: backup.storageLocation,
        });
      }
    } catch (err) {
      console.error(`[SEARCH] Failed to search backup ${backup.id}:`, err);
    }
  }

  const stats: SearchStats = {
    totalBackupsSearched: backups.length,
    totalMatches,
    devicesWithMatches: devicesWithMatches.size,
    searchTimeMs: Date.now() - startTime,
  };

  return { results, stats };
}

/**
 * Search for specific patterns across all device configs (latest backup per device)
 * Useful for compliance checks: "Find all devices with VLAN 100"
 */
export async function searchLatestConfigs(
  prisma: PrismaClient,
  options: Omit<SearchOptions, 'startDate' | 'endDate'> & { onlyLatest?: boolean }
): Promise<{ results: SearchResult[]; stats: SearchStats }> {
  const startTime = Date.now();
  const { query, deviceIds, deviceTypes, vendors, limit = 100, caseSensitive = false, useRegex = false } = options;

  // Get latest backup per device
  const latestBackups = await prisma.$queryRaw<{
    id: string;
    deviceId: string;
    timestamp: Date;
    configContent: Buffer | null;
    isCompressed: boolean;
    isEncrypted: boolean;
    storageLocation: string;
    filePath: string | null;
  }[]>`
    SELECT DISTINCT ON (b."deviceId") b.id, b."deviceId", b.timestamp, b."configContent", 
           b."isCompressed", b."isEncrypted", b."storageLocation", b."filePath"
    FROM "Backup" b
    WHERE b."deletedAt" IS NULL AND b.status = 'SUCCESS'
    ORDER BY b."deviceId", b.timestamp DESC
  `;

  // Filter by device criteria if needed
  let filteredBackups = latestBackups;
  if (deviceIds?.length) {
    filteredBackups = filteredBackups.filter(b => deviceIds.includes(b.deviceId));
  }

  // Get device info
  const deviceIdsInResults = [...new Set(filteredBackups.map(b => b.deviceId))];
  let deviceWhere: any = { id: { in: deviceIdsInResults }, deletedAt: null };
  if (deviceTypes?.length) deviceWhere.type = { in: deviceTypes };
  if (vendors?.length) deviceWhere.vendor = { in: vendors };

  const devices = await prisma.device.findMany({
    where: deviceWhere,
    select: { id: true, name: true, ip: true, type: true, vendor: true },
  });
  const deviceMap = new Map(devices.map(d => [d.id, d]));

  // Filter backups by device criteria
  if (deviceTypes?.length || vendors?.length) {
    const allowedDeviceIds = new Set(devices.map(d => d.id));
    filteredBackups = filteredBackups.filter(b => allowedDeviceIds.has(b.deviceId));
  }

  // Prepare regex
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = useRegex
    ? new RegExp(query, flags)
    : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

  // Search
  const results: SearchResult[] = [];
  let totalMatches = 0;
  const devicesWithMatches = new Set<string>();

  for (const backup of filteredBackups.slice(0, limit)) {
    try {
      const content = await getBackupContent({
        id: backup.id,
        configContent: backup.configContent,
        storageLocation: backup.storageLocation,
        filePath: backup.filePath,
        isCompressed: backup.isCompressed,
        isEncrypted: backup.isEncrypted,
      });

      const lines = content.split('\n');
      const matches: SearchMatch[] = [];

      lines.forEach((line, lineIndex) => {
        if (regex.test(line)) {
          totalMatches++;
          devicesWithMatches.add(backup.deviceId);

          matches.push({
            lineNumber: lineIndex + 1,
            line,
            contextBefore: lines.slice(Math.max(0, lineIndex - 2), lineIndex),
            contextAfter: lines.slice(lineIndex + 1, lineIndex + 3),
          });
        }
      });

      if (matches.length > 0) {
        const device = deviceMap.get(backup.deviceId);
        results.push({
          backupId: backup.id,
          deviceId: backup.deviceId,
          deviceName: device?.name ?? 'Unknown',
          deviceIp: device?.ip ?? 'Unknown',
          deviceType: device?.type ?? 'Unknown',
          vendor: device?.vendor ?? null,
          timestamp: backup.timestamp,
          matches,
          storageLocation: backup.storageLocation,
        });
      }
    } catch (err) {
      console.error(`[SEARCH] Failed to search backup ${backup.id}:`, err);
    }
  }

  return {
    results,
    stats: {
      totalBackupsSearched: filteredBackups.length,
      totalMatches,
      devicesWithMatches: devicesWithMatches.size,
      searchTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Get search suggestions based on common patterns
 */
export function getSearchSuggestions(): string[] {
  return [
    'vlan 100',
    'interface GigabitEthernet',
    'ip route 0.0.0.0',
    'snmp-server community',
    'user admin',
    'access-list',
    'ospf',
    'bgp',
    'spanning-tree',
    'aaa authentication',
    'radius-server',
    'ntp server',
    'logging',
    'banner',
    'hostname',
  ];
}