import { z } from 'zod';

export const createMaintenanceWindowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  deviceIds: z.array(z.string().min(1)).optional(),
  deviceTypes: z.array(z.string()).optional(),
  isRecurring: z.boolean().default(false),
  cronExpression: z.string().optional(),
  timezone: z.string().default('UTC'),
  suppressAlerts: z.boolean().default(true),
}).refine((data) => data.endTime > data.startTime, {
  message: 'End time must be after start time',
  path: ['endTime'],
}).refine((data) => !data.isRecurring || (data.isRecurring && data.cronExpression), {
  message: 'Cron expression required for recurring maintenance windows',
  path: ['cronExpression'],
});

export const updateMaintenanceWindowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  deviceIds: z.array(z.string().min(1)).optional(),
  deviceTypes: z.array(z.string()).optional(),
  isRecurring: z.boolean().optional(),
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  suppressAlerts: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

export const queryMaintenanceWindowSchema = z.object({
  isActive: z.coerce.boolean().optional(),
  deviceId: z.string().optional(),
  startAfter: z.coerce.date().optional(),
  endBefore: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['startTime', 'name', 'createdAt']).default('startTime'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const maintenanceWindowIdSchema = z.object({
  id: z.string().min(1),
});