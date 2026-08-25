import { PrismaClient, Prisma } from '@prisma/client';

export interface VersionedEntity {
  id: string;
  entityType: string;
  entityId: string;
  version: number;
  data: Record<string, any>;
  changedBy: string;
  changedAt: Date;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
}

export interface DiffResult {
  field: string;
  oldValue: any;
  newValue: any;
  changeType: 'ADDED' | 'REMOVED' | 'MODIFIED';
}

export interface VersionHistoryOptions {
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
  changedBy?: string;
  changeType?: VersionedEntity['changeType'][];
}

export class VersioningService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createVersion<T extends Record<string, any>>(
    entityType: string,
    entityId: string,
    data: T,
    changedBy: string,
    changeType: VersionedEntity['changeType'],
    previousVersion?: number
  ): Promise<void> {
    const version = previousVersion !== undefined ? previousVersion + 1 : await this.getNextVersion(entityType, entityId);

    await this.prisma.entityVersion.create({
      data: {
        entityType,
        entityId,
        version,
        data: data as Prisma.InputJsonValue,
        changedBy,
        changeType,
      },
    });
  }

  private async getNextVersion(entityType: string, entityId: string): Promise<number> {
    const latest = await this.prisma.entityVersion.findFirst({
      where: { entityType, entityId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return latest ? latest.version + 1 : 1;
  }

  async getVersionHistory(
    entityType: string,
    entityId: string,
    options: VersionHistoryOptions = {}
  ): Promise<{ versions: VersionedEntity[]; total: number }> {
    const { limit = 50, offset = 0, startDate, endDate, changedBy, changeType } = options;

    const where: Prisma.EntityVersionWhereInput = {
      entityType,
      entityId,
    };

    if (startDate || endDate) {
      where.changedAt = {};
      if (startDate) where.changedAt.gte = startDate;
      if (endDate) where.changedAt.lte = endDate;
    }

    if (changedBy) where.changedBy = changedBy;
    if (changeType) where.changeType = { in: changeType };

    const [versions, total] = await Promise.all([
      this.prisma.entityVersion.findMany({
        where,
        orderBy: { version: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.entityVersion.count({ where }),
    ]);

    return { versions: versions as VersionedEntity[], total };
  }

  async getVersion<T = Record<string, any>>(
    entityType: string,
    entityId: string,
    version: number
  ): Promise<{ entity: VersionedEntity; data: T } | null> {
    const entity = await this.prisma.entityVersion.findUnique({
      where: { entityType_entityId_version: { entityType, entityId, version } },
    });

    if (!entity) return null;

    return {
      entity: entity as VersionedEntity,
      data: entity.data as T,
    };
  }

  async getCurrentVersion(entityType: string, entityId: string): Promise<number> {
    const latest = await this.prisma.entityVersion.findFirst({
      where: { entityType, entityId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return latest?.version ?? 0;
  }

  async restoreVersion(
    entityType: string,
    entityId: string,
    version: number,
    restoredBy: string
  ): Promise<{ success: boolean; data?: Record<string, any>; error?: string }> {
    const targetVersion = await this.prisma.entityVersion.findUnique({
      where: { entityType_entityId_version: { entityType, entityId, version } },
    });

    if (!targetVersion) {
      return { success: false, error: 'Version not found' };
    }

    const currentVersion = await this.getCurrentVersion(entityType, entityId);

    await this.prisma.entityVersion.create({
      data: {
        entityType,
        entityId,
        version: currentVersion + 1,
        data: targetVersion.data as Prisma.InputJsonValue,
        changedBy: restoredBy,
        changeType: 'RESTORE',
      },
    });

    return { success: true, data: targetVersion.data as Record<string, any> };
  }

  async diffVersions(
    entityType: string,
    entityId: string,
    version1: number,
    version2: number
  ): Promise<DiffResult[]> {
    const [v1, v2] = await Promise.all([
      this.getVersion(entityType, entityId, version1),
      this.getVersion(entityType, entityId, version2),
    ]);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    return this.computeDiff(v1.data, v2.data);
  }

  private computeDiff(oldData: Record<string, any>, newData: Record<string, any>): DiffResult[] {
    const diffs: DiffResult[] = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    for (const key of allKeys) {
      const oldValue = oldData[key];
      const newValue = newData[key];

      if (oldValue === undefined && newValue !== undefined) {
        diffs.push({ field: key, oldValue: null, newValue, changeType: 'ADDED' });
      } else if (oldValue !== undefined && newValue === undefined) {
        diffs.push({ field: key, oldValue, newValue: null, changeType: 'REMOVED' });
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        diffs.push({ field: key, oldValue, newValue, changeType: 'MODIFIED' });
      }
    }

    return diffs;
  }

  async deleteVersionHistory(entityType: string, entityId: string): Promise<number> {
    const result = await this.prisma.entityVersion.deleteMany({
      where: { entityType, entityId },
    });
    return result.count;
  }

  async getVersionCount(entityType: string, entityId: string): Promise<number> {
    return this.prisma.entityVersion.count({ where: { entityType, entityId } });
  }
}

export function createVersioningService(prisma: PrismaClient): VersioningService {
  return new VersioningService(prisma);
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function omitFields<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  fields: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const field of fields) {
    delete result[field];
  }
  return result;
}

export function pickFields<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  fields: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const field of fields) {
    if (field in obj) {
      result[field] = obj[field];
    }
  }
  return result;
}