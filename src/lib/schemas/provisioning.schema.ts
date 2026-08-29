import { z } from './zod-extended';

const provisioningActionEnum = z.enum(['CREATE', 'SUSPEND', 'REACTIVATE', 'TERMINATE', 'STATUS_CHECK']);
const recordUnknown = z.record(z.string(), z.unknown());

export const executeProvisioningSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  action: provisioningActionEnum,
  parameters: recordUnknown,
  dryRun: z.boolean().default(false),
  templateName: z.string().optional(),
});

export const batchProvisioningSchema = z.object({
  items: z.array(z.object({
    deviceId: z.string().min(1),
    action: provisioningActionEnum,
    parameters: recordUnknown,
    templateName: z.string().optional(),
  })).min(1).max(50),
  dryRun: z.boolean().default(false),
});

export const scheduleProvisioningSchema = z.object({
  deviceId: z.string().min(1),
  action: provisioningActionEnum,
  parameters: recordUnknown,
  templateName: z.string().optional(),
  scheduledAt: z.coerce.date(),
  timezone: z.string().default('UTC'),
  recurring: z.boolean().default(false),
  cronExpression: z.string().optional(),
}).refine((data) => !data.recurring || (data.recurring && data.cronExpression), { message: 'Cron expression required for recurring schedules', path: ['cronExpression'] });

export const queryProvisioningLogSchema = z.object({
  deviceId: z.string().optional(),
  action: provisioningActionEnum.optional(),
  status: z.enum(['SUCCESS', 'FAILED', 'PENDING', 'IN_PROGRESS', 'ROLLED_BACK']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['createdAt', 'status', 'action']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const rollbackProvisioningSchema = z.object({
  logId: z.string().min(1, 'Provisioning log ID is required'),
  confirm: z.boolean().refine(val => val === true, { message: 'Confirmation required' }),
});

export const provisioningLogIdSchema = z.object({
  id: z.string().min(1),
});

export const validateTemplateSchema = z.object({
  vendor: z.enum(['huawei', 'zte', 'generic']),
  template: z.string().min(1),
  parameters: recordUnknown.optional(),
});

export const createProvisioningRequestSchema = z.object({
  deviceId: z.string().min(1),
  action: provisioningActionEnum,
  parameters: recordUnknown,
  templateName: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export const reviewProvisioningRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewerNote: z.string().max(1000).optional(),
});

// Bulk operations
export const bulkScheduleProvisioningSchema = z.object({
  items: z.array(z.object({
    deviceId: z.string().min(1),
    action: provisioningActionEnum,
    parameters: recordUnknown,
    templateName: z.string().optional(),
    scheduledAt: z.coerce.date(),
    timezone: z.string().default('UTC'),
    recurring: z.boolean().default(false),
    cronExpression: z.string().optional(),
  })).min(1).max(20),
});

export const bulkRollbackProvisioningSchema = z.object({
  logIds: z.array(z.string().min(1)).min(1).max(50),
  confirm: z.boolean().refine(val => val === true, 'Confirmation required'),
});

export const bulkRetryProvisioningSchema = z.object({
  logIds: z.array(z.string().min(1)).min(1).max(50),
  dryRun: z.boolean().default(false),
});