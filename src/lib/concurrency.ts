import { PrismaClient, Prisma } from '@prisma/client';

export interface OptimisticLockOptions {
  versionField?: string;
  retryOnConflict?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface ConcurrencyResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  currentVersion?: number;
}

export interface EntityWithVersion {
  version: number;
  updatedAt: Date;
}

export class OptimisticConcurrencyControl {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  updateWithOptimisticLock(
    model: string,
    where: Record<string, any>,
    data: Record<string, any>,
    expectedVersion: number,
    options: OptimisticLockOptions = {}
  ): Promise<ConcurrencyResult<any>> {
    const { versionField = 'version', maxRetries = 3, retryDelayMs = 100 } = options;
    
    const versionFieldName = versionField;
    
    return this.executeWithRetry(maxRetries, async (attempt: number) => {
      const result = await this.prisma.$transaction(async (tx) => {
        const current = await (tx as any)[model].findUnique({
          where,
          select: { [versionFieldName]: true },
        });

        if (!current) {
          throw new Error('Entity not found');
        }

        if (current[versionFieldName] !== expectedVersion) {
          throw new Error(`Version conflict: expected ${expectedVersion}, got ${current[versionFieldName]}`);
        }

        const updateData = {
          ...data,
          [versionFieldName]: expectedVersion + 1,
          updatedAt: new Date(),
        };

        return (tx as any)[model].update({
          where,
          data: updateData,
        });
      });

      return { success: true, data: result, currentVersion: expectedVersion + 1 };
    });
  }

  private async executeWithRetry(maxRetries: number, fn: (attempt: number) => Promise<any>): Promise<any> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(attempt);
      } catch (error: any) {
        if (error instanceof Error && error.message.includes('Version conflict')) {
          if (attempt < maxRetries) {
            await this.sleep(100 * (attempt + 1));
            continue;
          }
          return {
            success: false,
            error: `Version conflict after ${maxRetries} retries: ${error.message}`,
            currentVersion: 0,
          };
        }
        throw error;
      }
    }
    return { success: false, error: 'Max retries exceeded' };
  }

  updateWithETag(
    model: string,
    where: Record<string, any>,
    data: Record<string, any>,
    etag: string,
    options: { versionField?: string } = {}
  ): Promise<ConcurrencyResult<any>> {
    const versionField = options.versionField || 'version';
    
    return (this.prisma as any)[model].findUnique({
      where,
      select: { [versionField]: true },
    }).then((current: any) => {
      if (!current) {
        return { success: false, error: 'Entity not found' };
      }

      const currentEtag = this.generateETag(current);
      if (currentEtag !== etag) {
        return {
          success: false,
          error: 'ETag mismatch - entity has been modified',
          currentVersion: current[options.versionField || 'version'],
        };
      }

      return (this.prisma as any)[model].update({
        where,
        data: {
          ...data,
          [options.versionField || 'version']: current[options.versionField || 'version'] + 1,
          updatedAt: new Date(),
        },
      }).then((result: any) => ({
        success: true,
        data: result,
        currentVersion: current[options.versionField || 'version'] + 1
      })).catch((error: any) => ({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    });
  }

  generateETag(entity: Record<string, any>): string {
    const version = entity.version || 1;
    const updatedAt = entity.updatedAt?.getTime() || Date.now();
    return `${version}-${updatedAt}`;
  }

  parseETag(etag: string): { version: number; timestamp: number } | null {
    const parts = etag.split('-');
    if (parts.length !== 2) return null;
    return {
      version: parseInt(parts[0], 10),
      timestamp: parseInt(parts[1], 10),
    };
  }

  checkAndIncrementVersion(
    model: string,
    where: Record<string, any>,
    versionField: string = 'version'
  ): Promise<number> {
    return (this.prisma as any)[model].findUnique({
      where,
      select: { [versionField]: true },
    }).then((current: any) => {
      if (!current) {
        throw new Error('Entity not found');
      }

      return (this.prisma as any)[model].update({
        where,
        data: { [versionField]: current[versionField] + 1, updatedAt: new Date() },
      }).then(() => current[versionField] + 1);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function createOptimisticConcurrencyControl(prisma: PrismaClient): OptimisticConcurrencyControl {
  return new OptimisticConcurrencyControl(prisma);
}

export function withOptimisticLock(
  prisma: PrismaClient,
  model: string,
  where: Record<string, any>,
  data: Record<string, any>,
  expectedVersion: number,
  options: OptimisticLockOptions = {}
): Promise<ConcurrencyResult<any>> {
  const control = new OptimisticConcurrencyControl(prisma);
  return control.updateWithOptimisticLock(model, where, data, expectedVersion, options);
}

export function generateETag(version: number, updatedAt: Date | number): string {
  const timestamp = typeof updatedAt === 'number' ? updatedAt : updatedAt.getTime();
  return `${version}-${timestamp}`;
}

export function compareETags(etag1: string, etag2: string): boolean {
  return etag1 === etag2;
}

export function isETagValid(etag: string): boolean {
  const parts = etag.split('-');
  return parts.length === 2 && !isNaN(parseInt(parts[0], 10)) && !isNaN(parseInt(parts[1], 10));
}