import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';

export type ScheduledOperationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ScheduledOperationFrequency = 'ONCE' | 'MINUTE' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CRON';

export interface ScheduledOperationInput {
  name: string;
  description?: string;
  entityType: string;
  entityId?: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'CUSTOM';
  payload: Record<string, any>;
  frequency: ScheduledOperationFrequency;
  cronExpression?: string;
  startAt: Date;
  endAt?: Date;
  timezone?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  createdBy: string;
  tags?: string[];
}

export interface ScheduledOperation extends ScheduledOperationInput {
  id: string;
  status: ScheduledOperationStatus;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastRunStatus: ScheduledOperationStatus | null;
  lastRunError?: string;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledOperationRun {
  id: string;
  operationId: string;
  status: ScheduledOperationStatus;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  result?: Record<string, any>;
}

export interface ScheduledOperationQueryOptions {
  status?: ScheduledOperationStatus;
  entityType?: string;
  entityId?: string;
  frequency?: ScheduledOperationFrequency;
  createdBy?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ScheduledOperationsService {
  private prisma: PrismaClient;
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createOperation(input: ScheduledOperationInput): Promise<ScheduledOperation> {
    const { cronExpression, frequency, startAt, endAt, ...rest } = input;

    let nextRunAt: Date | null = null;

    if (frequency === 'ONCE') {
      nextRunAt = startAt;
    } else if (frequency === 'CRON' && cronExpression) {
      nextRunAt = this.calculateNextCronRun(cronExpression, startAt);
    } else {
      nextRunAt = this.calculateNextIntervalRun(frequency, startAt);
    }

    if (endAt && nextRunAt && nextRunAt > endAt) {
      nextRunAt = null;
    }

    const operation = await this.prisma.scheduledOperation.create({
      data: {
        ...rest,
        entityId: input.entityId || null,
        description: input.description || null,
        endAt: input.endAt || null,
        cronExpression: input.cronExpression || null,
        timezone: input.timezone || 'UTC',
        maxRetries: input.maxRetries ?? 3,
        retryDelayMs: input.retryDelayMs ?? 60000,
        tags: input.tags || [],
        nextRunAt,
        status: nextRunAt ? 'PENDING' : 'COMPLETED',
        runCount: 0,
      },
    });

    if (nextRunAt) {
      this.scheduleOperation(operation);
    }

    return operation as ScheduledOperation;
  }

  private calculateNextCronRun(cronExpression: string, fromDate: Date): Date | null {
    try {
      const interval = cron.validate(cronExpression);
      if (!interval) return null;
      
      const next = cron.schedule(cronExpression, () => {}).next(1, fromDate);
      return next.toDate();
    } catch {
      return null;
    }
  }

  private calculateNextIntervalRun(frequency: ScheduledOperationFrequency, fromDate: Date): Date {
    const date = new Date(fromDate);
    
    switch (frequency) {
      case 'MINUTE':
        date.setMinutes(date.getMinutes() + 1);
        break;
      case 'HOURLY':
        date.setHours(date.getHours() + 1);
        break;
      case 'DAILY':
        date.setDate(date.getDate() + 1);
        break;
      case 'WEEKLY':
        date.setDate(date.getDate() + 7);
        break;
      case 'MONTHLY':
        date.setMonth(date.getMonth() + 1);
        break;
      default:
        date.setDate(date.getDate() + 1);
    }
    return date;
  }

  private scheduleOperation(operation: ScheduledOperation): void {
    const jobId = operation.id;
    
    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId)?.stop();
      this.jobs.delete(jobId);
    }

    const now = new Date();
    if (operation.nextRunAt && operation.nextRunAt <= now) {
      this.executeOperation(jobId);
      return;
    }

    let task: cron.ScheduledTask;

    if (operation.frequency === 'CRON' && operation.cronExpression) {
      task = cron.schedule(operation.cronExpression, () => {
        this.executeOperation(jobId);
      }, {
        scheduled: true,
        timezone: operation.timezone,
      });
    } else {
      const delay = operation.nextRunAt ? operation.nextRunAt.getTime() - Date.now() : 0;
      if (delay > 0) {
        const timeout = setTimeout(() => {
          this.executeOperation(jobId);
        }, delay);
        
        task = {
          stop: () => clearTimeout(timeout),
          destroy: () => clearTimeout(timeout),
          start: () => {},
        } as unknown as cron.ScheduledTask;
      } else {
        this.executeOperation(jobId);
        return;
      }
    }

    this.jobs.set(jobId, task);
  }

  async executeOperation(operationId: string): Promise<void> {
    const operation = await this.prisma.scheduledOperation.findUnique({
      where: { id: operationId },
    });

    if (!operation) {
      console.warn(`Scheduled operation ${operationId} not found`);
      return;
    }

    if (operation.status === 'CANCELLED') {
      return;
    }

    if (operation.endAt && new Date() > operation.endAt) {
      await this.updateOperationStatus(operationId, 'COMPLETED');
      this.unscheduleOperation(operationId);
      return;
    }

    await this.updateOperationStatus(operationId, 'RUNNING');

    const startTime = Date.now();
    let result: Record<string, any> | undefined;
    let error: string | undefined;
    let status: ScheduledOperationStatus = 'COMPLETED';

    try {
      result = await this.executeOperationLogic(operation);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      status = 'FAILED';
    }

    const duration = Date.now() - startTime;

    await this.prisma.scheduledOperationRun.create({
      data: {
        operationId,
        status,
        startedAt: new Date(Date.now() - duration),
        completedAt: new Date(),
        error,
        result,
        durationMs: duration,
      },
    });

    await this.updateOperationAfterRun(operationId, status, error, result);

    if (operation.frequency === 'ONCE') {
      this.unscheduleOperation(operationId);
    } else if (status === 'FAILED' && operation.maxRetries && operation.runCount < operation.maxRetries) {
      const retryDelay = operation.retryDelayMs ?? 60000;
      setTimeout(() => {
        this.executeOperation(operationId);
      }, retryDelay);
    }
  }

  private async executeOperationLogic(operation: ScheduledOperation): Promise<Record<string, any>> {
    switch (operation.operation) {
      case 'CREATE':
        return this.executeCreate(operation);
      case 'UPDATE':
        return this.executeUpdate(operation);
      case 'DELETE':
        return this.executeDelete(operation);
      case 'CUSTOM':
        return this.executeCustom(operation);
      default:
        throw new Error(`Unknown operation type: ${operation.operation}`);
    }
  }

  private async executeCreate(operation: ScheduledOperation): Promise<Record<string, any>> {
    const { entityType, payload } = operation;
    const model = this.getPrismaModel(entityType);
    if (!model) throw new Error(`Unknown entity type: ${entityType}`);
    
    const created = await this.prisma[model].create({ data: payload });
    return { id: created.id, ...created };
  }

  private async executeUpdate(operation: ScheduledOperation): Promise<Record<string, any>> {
    const { entityType, entityId, payload } = operation;
    if (!entityId) throw new Error('entityId required for UPDATE operation');
    
    const model = this.getPrismaModel(entityType);
    if (!model) throw new Error(`Unknown entity type: ${entityType}`);
    
    const updated = await this.prisma[model].update({
      where: { id: entityId },
      data: payload,
    });
    return { id: updated.id, ...updated };
  }

  private async executeDelete(operation: ScheduledOperation): Promise<Record<string, any>> {
    const { entityType, entityId } = operation;
    if (!entityId) throw new Error('entityId required for DELETE operation');
    
    const model = this.getPrismaModel(entityType);
    if (!model) throw new Error(`Unknown entity type: ${entityType}`);
    
    await this.prisma[model].delete({ where: { id: entityId } });
    return { id: entityId, deleted: true };
  }

  private async executeCustom(operation: ScheduledOperation): Promise<Record<string, any>> {
    return { executed: true, timestamp: new Date().toISOString() };
  }

  private getPrismaModel(entityType: string): string | null {
    const modelMap: Record<string, string> = {
      'Device': 'device',
      'Alert': 'alert',
      'User': 'user',
      'AlertRule': 'alertRule',
      'Backup': 'backup',
      'ProvisioningLog': 'provisioningLog',
      'Anomaly': 'anomaly',
      'FeatureFlag': 'featureFlag',
      'MaintenanceWindow': 'maintenanceWindow',
      'ScheduledOperation': 'scheduledOperation',
    };
    return modelMap[entityType] || null;
  }

  private async updateOperationStatus(operationId: string, status: ScheduledOperationStatus): Promise<void> {
    await this.prisma.scheduledOperation.update({
      where: { id: operationId },
      data: { status },
    });
  }

  private async updateOperationAfterRun(
    operationId: string,
    status: ScheduledOperationStatus,
    error?: string,
    result?: Record<string, any>
  ): Promise<void> {
    const operation = await this.prisma.scheduledOperation.findUnique({
      where: { id: operationId },
    });

    if (!operation) return;

    let nextRunAt: Date | null = null;
    let newStatus = status;

    if (operation.frequency === 'ONCE') {
      newStatus = 'COMPLETED';
      nextRunAt = null;
    } else if (status === 'COMPLETED') {
      if (operation.endAt && new Date() > operation.endAt) {
        newStatus = 'COMPLETED';
        nextRunAt = null;
      } else if (operation.frequency === 'CRON' && operation.cronExpression) {
        nextRunAt = this.calculateNextCronRun(operation.cronExpression, new Date());
      } else {
        nextRunAt = this.calculateNextIntervalRun(operation.frequency, new Date());
      }
    }

    if (operation.endAt && nextRunAt && nextRunAt > operation.endAt) {
      nextRunAt = null;
      newStatus = 'COMPLETED';
    }

    await this.prisma.scheduledOperation.update({
      where: { id: operation.id },
      data: {
        status: newStatus,
        nextRunAt,
        lastRunAt: new Date(),
        lastRunStatus: status,
        lastRunError: error,
        runCount: { increment: 1 },
      },
    });

    if (nextRunAt) {
      this.scheduleOperation({
        ...operation,
        status: newStatus,
        nextRunAt,
        runCount: operation.runCount + 1,
      } as any);
    } else {
      this.unscheduleOperation(operation.id);
    }
  }

  async getOperations(options: ScheduledOperationQueryOptions = {}): Promise<PaginatedResult<ScheduledOperation>> {
    const { 
      status, 
      entityType, 
      entityId, 
      frequency, 
      createdBy,
      startDate, 
      endDate,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    const where: any = {};

    if (status) where.status = status;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (frequency) where.frequency = frequency;
    if (createdBy) where.createdBy = createdBy;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [operations, total] = await Promise.all([
      this.prisma.scheduledOperation.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.scheduledOperation.count({ where }),
    ]);

    return {
      data: operations as ScheduledOperation[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOperationById(id: string): Promise<ScheduledOperation | null> {
    return this.prisma.scheduledOperation.findUnique({ where: { id } }) as Promise<ScheduledOperation | null>;
  }

  async updateOperation(id: string, data: Partial<ScheduledOperationInput>): Promise<ScheduledOperation> {
    const existing = await this.prisma.scheduledOperation.findUnique({ where: { id } });
    if (!existing) throw new Error('Operation not found');

    const updated = await this.prisma.scheduledOperation.update({
      where: { id },
      data: {
        ...data,
        nextRunAt: data.startAt || existing.nextRunAt,
      },
    });

    this.unscheduleOperation(id);
    if (updated.nextRunAt) {
      this.scheduleOperation(updated as ScheduledOperation);
    }

    return updated as ScheduledOperation;
  }

  async cancelOperation(id: string): Promise<void> {
    await this.prisma.scheduledOperation.update({
      where: { id },
      data: { status: 'CANCELLED', nextRunAt: null },
    });
    this.unscheduleOperation(id);
  }

  async deleteOperation(id: string): Promise<void> {
    this.unscheduleOperation(id);
    await this.prisma.scheduledOperationRun.deleteMany({ where: { operationId: id } });
    await this.prisma.scheduledOperation.delete({ where: { id } });
  }

  unscheduleOperation(operationId: string): void {
    const job = this.jobs.get(operationId);
    if (job) {
      job.stop();
      job.destroy();
      this.jobs.delete(operationId);
    }
  }

  async getRuns(operationId: string, limit = 50): Promise<ScheduledOperationRun[]> {
    return this.prisma.scheduledOperationRun.findMany({
      where: { operationId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    }) as Promise<ScheduledOperationRun[]>;
  }

  async getUpcomingOperations(limit = 50): Promise<ScheduledOperation[]> {
    return this.prisma.scheduledOperation.findMany({
      where: {
        status: 'PENDING',
        nextRunAt: { not: null, lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      },
      orderBy: { nextRunAt: 'asc' },
      take: limit,
    }) as Promise<ScheduledOperation[]>;
  }

  async getStats(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const [total, pending, running, completed, failed, cancelled] = await Promise.all([
      this.prisma.scheduledOperation.count(),
      this.prisma.scheduledOperation.count({ where: { status: 'PENDING' } }),
      this.prisma.scheduledOperation.count({ where: { status: 'RUNNING' } }),
      this.prisma.scheduledOperation.count({ where: { status: 'COMPLETED' } }),
      this.prisma.scheduledOperation.count({ where: { status: 'FAILED' } }),
      this.prisma.scheduledOperation.count({ where: { status: 'CANCELLED' } }),
    ]);

    return { total, pending, running, completed, failed, cancelled };
  }

  shutdown(): void {
    for (const [id, job] of this.jobs) {
      job.stop();
      job.destroy();
    }
    this.jobs.clear();
    this.isRunning = false;
  }
}

export function createScheduledOperationsService(prisma: PrismaClient): ScheduledOperationsService {
  return new ScheduledOperationsService(prisma);
}