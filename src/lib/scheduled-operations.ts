import { PrismaClient, Prisma } from '@prisma/client';
import * as cron from 'node-cron';
import { CronJob } from 'cron';
import { PaginatedResult } from './common-types';

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

interface CronTask {
  stop: () => void;
  destroy: () => void;
  start: () => void;
}

export class ScheduledOperationsService {
  private prisma: PrismaClient;
  private jobs: Map<string, cron.ScheduledTask | CronTask> = new Map();
  private isRunning = false;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private mapOperation(op: any): ScheduledOperation {
    return {
      id: op.id,
      name: op.name,
      description: op.description ?? undefined,
      entityType: op.entityType,
      entityId: op.entityId ?? undefined,
      operation: op.operation as ScheduledOperationInput['operation'],
      payload: (op.payload as unknown as Record<string, any>) || {},
      frequency: op.frequency as ScheduledOperationFrequency,
      cronExpression: op.cronExpression ?? undefined,
      startAt: op.startAt,
      endAt: op.endAt ?? undefined,
      timezone: op.timezone,
      maxRetries: op.maxRetries,
      retryDelayMs: op.retryDelayMs,
      status: op.status as ScheduledOperationStatus,
      nextRunAt: op.nextRunAt ?? null,
      lastRunAt: op.lastRunAt ?? null,
      lastRunStatus: (op.lastRunStatus as ScheduledOperationStatus) ?? null,
      lastRunError: op.lastRunError ?? undefined,
      runCount: op.runCount,
      tags: (op.tags as unknown as string[]) || [],
      createdBy: op.createdBy,
      createdAt: op.createdAt,
      updatedAt: op.updatedAt,
    };
  }

  private mapRun(run: any): ScheduledOperationRun {
    return {
      id: run.id,
      operationId: run.operationId,
      status: run.status as ScheduledOperationStatus,
      startedAt: run.startedAt,
      completedAt: run.completedAt ?? undefined,
      error: run.error ?? undefined,
      result: run.result ? (run.result as unknown as Record<string, any>) : undefined,
    };
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
        name: input.name,
        description: input.description ?? null,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        operation: input.operation,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        frequency: input.frequency,
        cronExpression: input.cronExpression ?? null,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        timezone: input.timezone || 'UTC',
        maxRetries: input.maxRetries ?? 3,
        retryDelayMs: input.retryDelayMs ?? 60000,
        tags: (input.tags || []) as unknown as Prisma.InputJsonValue,
        createdBy: input.createdBy,
        nextRunAt,
        status: nextRunAt ? 'PENDING' : 'COMPLETED',
        runCount: 0,
      },
    });

    const mapped = this.mapOperation(operation);

    if (nextRunAt) {
      this.scheduleOperation(mapped);
    }

    return mapped;
  }

  private calculateNextCronRun(cronExpression: string, fromDate?: Date): Date | null {
    try {
      const job = new CronJob(cronExpression, () => {});
      const nextDate = job.nextDate();
      return nextDate.toJSDate();
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

    if (operation.frequency === 'CRON' && operation.cronExpression) {
      const task = cron.schedule(operation.cronExpression, () => {
        this.executeOperation(jobId);
      }, {
        timezone: operation.timezone,
      });
      this.jobs.set(jobId, task);
    } else {
      const delay = operation.nextRunAt ? operation.nextRunAt.getTime() - Date.now() : 0;
      if (delay > 0) {
        const timeout = setTimeout(() => {
          this.executeOperation(jobId);
        }, delay);
        
        const task = {
          stop: () => clearTimeout(timeout),
          destroy: () => clearTimeout(timeout),
          start: () => {},
        };
        this.jobs.set(jobId, task);
      } else {
        this.executeOperation(jobId);
        return;
      }
    }
  }

  async executeOperation(operationId: string): Promise<void> {
    const operationRecord = await this.prisma.scheduledOperation.findUnique({
      where: { id: operationId },
    });

    if (!operationRecord) {
      console.warn(`Scheduled operation ${operationId} not found`);
      return;
    }

    const operation = this.mapOperation(operationRecord);

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
        result: result ? (result as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        durationMs: duration,
      },
    });

    await this.updateOperationAfterRun(operationId, status, error, result || {});

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
    const model = this.getPrismaModel(operation.entityType);
    if (!model) throw new Error(`Unknown entity type: ${entityType}`);
    
    const created = await (this.prisma as any)[model].create({ data: payload });
    return { id: created.id, ...created };
  }

  private async executeUpdate(operation: ScheduledOperation): Promise<Record<string, any>> {
    const { entityType, entityId, payload } = operation;
    if (!entityId) throw new Error('entityId required for UPDATE operation');
    
    const model = this.getPrismaModel(operation.entityType);
    if (!model) throw new Error(`Unknown entity type: ${operation.entityType}`);
    
    const updated = await (this.prisma as any)[model].update({
      where: { id: entityId },
      data: payload,
    });
    return { id: updated.id, ...updated };
  }

  private async executeDelete(operation: ScheduledOperation): Promise<Record<string, any>> {
    const { entityType, entityId } = operation;
    if (!entityId) throw new Error('entityId required for DELETE operation');
    
    const model = this.getPrismaModel(operation.entityType);
    if (!model) throw new Error(`Unknown entity type: ${operation.entityType}`);
    
    await (this.prisma as any)[model].delete({ where: { id: entityId } });
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
    const operationRecord = await this.prisma.scheduledOperation.findUnique({
      where: { id: operationId },
    });

    if (!operationRecord) return;
    const operation = this.mapOperation(operationRecord);

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

    const updated = await this.prisma.scheduledOperation.update({
      where: { id: operation.id },
      data: {
        status: newStatus,
        nextRunAt,
        lastRunAt: new Date(),
        lastRunStatus: status,
        lastRunError: error ?? null,
        runCount: { increment: 1 },
      },
    });

    const mappedUpdated = this.mapOperation(updated);

    if (nextRunAt) {
      this.scheduleOperation(mappedUpdated);
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

    const where: Prisma.ScheduledOperationWhereInput = {};

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
      data: operations.map(op => this.mapOperation(op)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getOperationById(id: string): Promise<ScheduledOperation | null> {
    const op = await this.prisma.scheduledOperation.findUnique({ where: { id } });
    return op ? this.mapOperation(op) : null;
  }

  async updateOperation(id: string, data: Partial<ScheduledOperationInput>): Promise<ScheduledOperation> {
    const existing = await this.prisma.scheduledOperation.findUnique({ where: { id } });
    if (!existing) throw new Error('Operation not found');

    const updateData: Prisma.ScheduledOperationUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.entityType !== undefined) updateData.entityType = data.entityType;
    if (data.entityId !== undefined) updateData.entityId = data.entityId;
    if (data.operation !== undefined) updateData.operation = data.operation;
    if (data.payload !== undefined) updateData.payload = data.payload as unknown as Prisma.InputJsonValue;
    if (data.frequency !== undefined) updateData.frequency = data.frequency;
    if (data.cronExpression !== undefined) updateData.cronExpression = data.cronExpression;
    if (data.startAt !== undefined) {
      updateData.startAt = data.startAt;
      updateData.nextRunAt = data.startAt;
    }
    if (data.endAt !== undefined) updateData.endAt = data.endAt;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.maxRetries !== undefined) updateData.maxRetries = data.maxRetries;
    if (data.retryDelayMs !== undefined) updateData.retryDelayMs = data.retryDelayMs;
    if (data.tags !== undefined) updateData.tags = data.tags as unknown as Prisma.InputJsonValue;

    const updated = await this.prisma.scheduledOperation.update({
      where: { id },
      data: updateData,
    });

    const mapped = this.mapOperation(updated);
    this.unscheduleOperation(id);
    if (mapped.nextRunAt) {
      this.scheduleOperation(mapped);
    }

    return mapped;
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
    const runs = await this.prisma.scheduledOperationRun.findMany({
      where: { operationId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return runs.map(r => this.mapRun(r));
  }

  async getUpcomingOperations(limit = 50): Promise<ScheduledOperation[]> {
    const ops = await this.prisma.scheduledOperation.findMany({
      where: {
        status: 'PENDING',
        nextRunAt: { not: null, lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      },
      orderBy: { nextRunAt: 'asc' },
      take: limit,
    });
    return ops.map(op => this.mapOperation(op));
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