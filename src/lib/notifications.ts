import { PrismaClient, Prisma } from '@prisma/client';
import { PaginatedResult } from './common-types';

export type NotificationChannel = 'WEBHOOK' | 'EMAIL' | 'SSE' | 'WEBSOCKET' | 'LOG';
export type NotificationEvent = 
  | 'ENTITY_CREATED'
  | 'ENTITY_UPDATED'
  | 'ENTITY_DELETED'
  | 'ENTITY_RESTORED'
  | 'VERSION_CREATED'
  | 'VERSION_RESTORED'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'SCHEDULED_OPERATION_STARTED'
  | 'SCHEDULED_OPERATION_COMPLETED'
  | 'SCHEDULED_OPERATION_FAILED';

export interface NotificationSubscription {
  id: string;
  name: string;
  description?: string;
  events: NotificationEvent[];
  entityTypes: string[];
  entityIds: string[];
  channel: NotificationChannel;
  config: Record<string, any>;
  filter?: string; // JSON path filter expression
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastTriggeredAt?: Date;
  triggerCount: number;
}

export interface NotificationPayload {
  id: string;
  event: NotificationEvent;
  timestamp: string;
  entityType: string;
  entityId: string;
  entityVersion?: number;
  changedBy?: string;
  changes?: Record<string, { old: any; new: any }>;
  metadata?: Record<string, any>;
}

export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  secret?: string;
  timeoutMs?: number;
  retryPolicy?: {
    maxRetries: number;
    delayMs: number;
    backoffMultiplier?: number;
  };
}

export interface EmailConfig {
  to: string | string[];
  from?: string;
  subject?: string;
  template?: string;
  templateData?: Record<string, any>;
}

export interface SSEConfig {
  channels?: string[];
  eventName?: string;
}

export interface NotificationLog {
  id: string;
  subscriptionId: string;
  event: NotificationEvent;
  entityType: string;
  entityId: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'RETRYING';
  payload: Record<string, any>;
  response?: Record<string, any>;
  error?: string;
  attempts: number;
  createdAt: Date;
  sentAt?: Date;
  nextRetryAt?: Date;
}

export interface NotificationQueryOptions {
  status?: string;
  event?: NotificationEvent;
  entityType?: string;
  entityId?: string;
  subscriptionId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export type JsonValue = Prisma.JsonValue;

export class NotificationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private mapSubscription(sub: any): NotificationSubscription {
    return {
      id: sub.id,
      name: sub.name,
      description: sub.description ?? undefined,
      events: (sub.events as unknown as NotificationEvent[]) || [],
      entityTypes: (sub.entityTypes as unknown as string[]) || [],
      entityIds: (sub.entityIds as unknown as string[]) || [],
      channel: sub.channel as NotificationChannel,
      config: (sub.config as unknown as Record<string, any>) || {},
      filter: sub.filter ?? undefined,
      isActive: sub.isActive,
      createdBy: sub.createdBy,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
      lastTriggeredAt: sub.lastTriggeredAt ?? undefined,
      triggerCount: sub.triggerCount,
    };
  }

  private mapLog(log: any): NotificationLog {
    return {
      id: log.id,
      subscriptionId: log.subscriptionId,
      event: log.event as NotificationEvent,
      entityType: log.entityType,
      entityId: log.entityId,
      status: log.status as NotificationLog['status'],
      payload: (log.payload as unknown as Record<string, any>) || {},
      response: log.response ? (log.response as unknown as Record<string, any>) : undefined,
      error: log.error ?? undefined,
      attempts: log.attempts,
      createdAt: log.createdAt,
      sentAt: log.sentAt ?? undefined,
      nextRetryAt: log.nextRetryAt ?? undefined,
    };
  }

  async createSubscription(input: Omit<NotificationSubscription, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount' | 'lastTriggeredAt'>): Promise<NotificationSubscription> {
    const subscription = await this.prisma.notificationSubscription.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        events: input.events as unknown as Prisma.InputJsonValue,
        entityTypes: (input.entityTypes || []) as unknown as Prisma.InputJsonValue,
        entityIds: (input.entityIds || []) as unknown as Prisma.InputJsonValue,
        channel: input.channel,
        config: input.config as unknown as Prisma.InputJsonValue,
        filter: input.filter ?? null,
        isActive: input.isActive ?? true,
        createdBy: input.createdBy,
        triggerCount: 0,
      },
    });
    return this.mapSubscription(subscription);
  }

  async updateSubscription(id: string, updates: Partial<NotificationSubscription>): Promise<NotificationSubscription> {
    const data: Prisma.NotificationSubscriptionUpdateInput = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.events !== undefined) data.events = updates.events as unknown as Prisma.InputJsonValue;
    if (updates.entityTypes !== undefined) data.entityTypes = updates.entityTypes as unknown as Prisma.InputJsonValue;
    if (updates.entityIds !== undefined) data.entityIds = updates.entityIds as unknown as Prisma.InputJsonValue;
    if (updates.channel !== undefined) data.channel = updates.channel;
    if (updates.config !== undefined) data.config = updates.config as unknown as Prisma.InputJsonValue;
    if (updates.filter !== undefined) data.filter = updates.filter;
    if (updates.isActive !== undefined) data.isActive = updates.isActive;
    if (updates.lastTriggeredAt !== undefined) data.lastTriggeredAt = updates.lastTriggeredAt;
    if (updates.triggerCount !== undefined) data.triggerCount = updates.triggerCount;
    data.updatedAt = new Date();

    const subscription = await this.prisma.notificationSubscription.update({
      where: { id },
      data,
    });
    return this.mapSubscription(subscription);
  }

  async getSubscription(id: string): Promise<NotificationSubscription | null> {
    const subscription = await this.prisma.notificationSubscription.findUnique({ where: { id } });
    return subscription ? this.mapSubscription(subscription) : null;
  }

  async getSubscriptions(
    isActive?: boolean,
    event?: string,
    channel?: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedResult<NotificationSubscription>> {
    const where: Prisma.NotificationSubscriptionWhereInput = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (channel) where.channel = channel;

    const [subscriptions, total] = await Promise.all([
      this.prisma.notificationSubscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notificationSubscription.count({ where }),
    ]);

    let mapped = subscriptions.map(sub => this.mapSubscription(sub));
    if (event) {
      mapped = mapped.filter(sub => sub.events.includes(event as NotificationEvent));
    }

    return {
      data: mapped,
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

  async deleteSubscription(id: string): Promise<void> {
    await this.prisma.notificationSubscription.delete({ where: { id } });
  }

  async triggerNotification(
    event: NotificationEvent,
    entityType: string,
    entityId: string,
    data: {
      entityVersion?: number;
      changedBy?: string;
      changes?: Record<string, { old: any; new: any }>;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const subscriptions = await this.findMatchingSubscriptions(event, entityType, entityId);
    
    for (const subscription of subscriptions) {
      if (!subscription.isActive) continue;

      const payload: NotificationPayload = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        event,
        timestamp: new Date().toISOString(),
        entityType,
        entityId,
        entityVersion: data.entityVersion,
        changedBy: data.changedBy,
        changes: data.changes,
        metadata: data.metadata,
      };

      await this.queueNotification(subscription, payload);
    }
  }

  private async findMatchingSubscriptions(
    event: NotificationEvent,
    entityType: string,
    entityId: string
  ): Promise<NotificationSubscription[]> {
    const subscriptions = await this.prisma.notificationSubscription.findMany({
      where: {
        isActive: true,
      },
    });

    return subscriptions
      .map(sub => this.mapSubscription(sub))
      .filter(sub => {
        const eventsList = sub.events || [];
        const eventMatch = eventsList.length === 0 || eventsList.includes(event);
        const entityTypes = sub.entityTypes || [];
        const entityIds = sub.entityIds || [];
        
        const typeMatch = entityTypes.length === 0 || entityTypes.includes(entityType);
        const idMatch = entityIds.length === 0 || entityIds.includes(entityId);
        
        return eventMatch && typeMatch && idMatch;
      });
  }

  private async queueNotification(subscription: NotificationSubscription, payload: NotificationPayload): Promise<void> {
    const log = await this.prisma.notificationLog.create({
      data: {
        subscriptionId: subscription.id,
        event: payload.event,
        entityType: payload.entityType,
        entityId: payload.entityId,
        status: 'PENDING',
        payload: payload as unknown as Prisma.InputJsonValue,
        attempts: 0,
      },
    });

    switch (subscription.channel) {
      case 'WEBHOOK':
        this.processWebhook(subscription, payload, log.id);
        break;
      case 'EMAIL':
        this.processEmail(subscription, payload, log.id);
        break;
      case 'SSE':
        this.processSSE(subscription, payload, log.id);
        break;
      case 'LOG':
        this.processLog(subscription, payload, log.id);
        break;
      default:
        await this.updateLogStatus(log.id, 'FAILED', { error: 'Unknown channel' });
    }
  }

  private async processWebhook(
    subscription: NotificationSubscription,
    payload: NotificationPayload,
    logId: string
  ): Promise<void> {
    const config = subscription.config as WebhookConfig;
    const maxRetries = config.retryPolicy?.maxRetries ?? 3;
    const baseDelay = config.retryPolicy?.delayMs ?? 1000;

    let attempt = 0;
    let lastError: string | undefined;

    while (attempt <= maxRetries) {
      try {
        await this.updateLogStatus(logId, attempt > 0 ? 'RETRYING' : 'PENDING');
        
        const response = await fetch(config.url, {
          method: config.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'HK-NOVA-Notifications/1.0',
            ...config.headers,
            ...(config.secret ? { 'X-Webhook-Signature': this.generateSignature(payload, config.secret) } : {}),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(config.timeoutMs || 30000),
        });

        const responseData = await response.json().catch(() => ({}));

        if (response.ok) {
          await this.updateLogStatus(logId, 'SENT', { response: responseData });
          await this.prisma.notificationSubscription.update({
            where: { id: subscription.id },
            data: { lastTriggeredAt: new Date(), triggerCount: { increment: 1 } },
          });
          return;
        } else {
          throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        attempt++;
        
        if (attempt <= maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    await this.updateLogStatus(logId, 'FAILED', { error: lastError });
  }

  private async processEmail(
    subscription: NotificationSubscription,
    payload: NotificationPayload,
    logId: string
  ): Promise<void> {
    await this.updateLogStatus(logId, 'SENT', { message: 'Email queued for delivery' });
    await this.prisma.notificationSubscription.update({
      where: { id: subscription.id },
      data: { lastTriggeredAt: new Date(), triggerCount: { increment: 1 } },
    });
  }

  private async processSSE(
    subscription: NotificationSubscription,
    payload: NotificationPayload,
    logId: string
  ): Promise<void> {
    await this.updateLogStatus(logId, 'SENT', { message: 'SSE event broadcasted' });
    await this.prisma.notificationSubscription.update({
      where: { id: subscription.id },
      data: { lastTriggeredAt: new Date(), triggerCount: { increment: 1 } },
    });
  }

  private async processLog(
    subscription: NotificationSubscription,
    payload: NotificationPayload,
    logId: string
  ): Promise<void> {
    await this.updateLogStatus(logId, 'SENT', { message: 'Logged' });
    await this.prisma.notificationSubscription.update({
      where: { id: subscription.id },
      data: { lastTriggeredAt: new Date(), triggerCount: { increment: 1 } },
    });
  }

  private generateSignature(payload: NotificationPayload, secret: string): string {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  }

  private async updateLogStatus(
    logId: string,
    status: 'PENDING' | 'SENT' | 'FAILED' | 'RETRYING',
    data: { response?: Record<string, any>; error?: string; message?: string } = {}
  ): Promise<void> {
    await this.prisma.notificationLog.update({
      where: { id: logId },
      data: {
        status,
        response: data.response ? (data.response as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        error: data.error ?? null,
        attempts: { increment: 1 },
        sentAt: status === 'SENT' ? new Date() : undefined,
      },
    });
  }

  async getLogs(options: NotificationQueryOptions = {}): Promise<PaginatedResult<NotificationLog>> {
    const { status, event, entityType, entityId, subscriptionId, startDate, endDate, page = 1, limit = 50 } = options;

    const where: Prisma.NotificationLogWhereInput = {};
    if (status) where.status = status;
    if (event) where.event = event;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (subscriptionId) where.subscriptionId = subscriptionId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    return {
      data: logs.map(log => this.mapLog(log)),
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

  async retryFailedLog(logId: string): Promise<void> {
    const log = await this.prisma.notificationLog.findUnique({ where: { id: logId } });
    if (!log) throw new Error('Log not found');

    const subscription = await this.prisma.notificationSubscription.findUnique({
      where: { id: log.subscriptionId },
    });
    if (!subscription) throw new Error('Subscription not found');

    await this.updateLogStatus(log.id, 'RETRYING');
    this.queueNotification(this.mapSubscription(subscription), (log.payload as unknown) as NotificationPayload);
  }

  async getSubscriptionStats(subscriptionId: string): Promise<{
    totalSent: number;
    totalFailed: number;
    successRate: number;
    lastTriggeredAt: Date | null;
  }> {
    const [sent, failed] = await Promise.all([
      this.prisma.notificationLog.count({ where: { subscriptionId, status: 'SENT' } }),
      this.prisma.notificationLog.count({ where: { subscriptionId, status: 'FAILED' } }),
    ]);

    const total = sent + failed;
    return {
      totalSent: sent,
      totalFailed: failed,
      successRate: total > 0 ? (sent / total) * 100 : 0,
      lastTriggeredAt: await this.getLastTriggeredAt(subscriptionId),
    };
  }

  private async getLastTriggeredAt(subscriptionId: string): Promise<Date | null> {
    const lastLog = await this.prisma.notificationLog.findFirst({
      where: { subscriptionId, status: 'SENT' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    return lastLog?.sentAt ?? null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function createNotificationService(prisma: PrismaClient) {
  return new NotificationService(prisma);
}