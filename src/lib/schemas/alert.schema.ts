import { z } from 'zod';

const recordUnknown = z.record(z.string(), z.unknown());

const alertTypeEnum = z.enum([
  'DEVICE_DOWN',
  'DEVICE_UP',
  'HIGH_UTILIZATION',
  'ANOMALY_DETECTED',
  'BACKUP_FAILED',
  'PROVISIONING_FAILED',
  'CUSTOM_OID_OUT_OF_RANGE',
  'RULE_BREACH',
  'HIGH_CPU',
  'HIGH_MEMORY',
  'INTERFACE_DOWN',
  'INTERFACE_ERRORS',
]);

const alertSeverityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const alertStatusEnum = z.enum(['ACTIVE', 'RESOLVED', 'ACKNOWLEDGED']);

export const createAlertSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  type: alertTypeEnum,
  severity: alertSeverityEnum,
  message: z.string().min(1, 'Message is required').max(1000),
  metadata: recordUnknown.optional(),
  parentId: z.string().optional().nullable(),
});

export const updateAlertSchema = z.object({
  status: alertStatusEnum.optional(),
  severity: alertSeverityEnum.optional(),
  assigneeId: z.string().optional().nullable(),
  acknowledgedAt: z.coerce.date().optional().nullable(),
  resolvedAt: z.coerce.date().optional().nullable(),
  resolutionNote: z.string().max(2000).optional().nullable(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided for update' });

export const queryAlertSchema = z.object({
  status: alertStatusEnum.optional(),
  severity: alertSeverityEnum.optional(),
  type: alertTypeEnum.optional(),
  deviceId: z.string().optional(),
  assigneeId: z.string().optional(),
  search: z.string().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['createdAt', 'severity', 'status', 'type']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const acknowledgeAlertSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  note: z.string().max(1000).optional(),
});

export const resolveAlertSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  resolutionNote: z.string().min(1, 'Resolution note is required').max(2000),
});

export const bulkAcknowledgeSchema = z.object({
  action: z.literal('acknowledge'),
  ids: z.array(z.string().min(1)).min(1).max(100),
  userId: z.string().min(1, 'User ID is required'),
  note: z.string().max(1000).optional(),
});

export const bulkResolveSchema = z.object({
  action: z.literal('resolve'),
  ids: z.array(z.string().min(1)).min(1).max(100),
  userId: z.string().min(1, 'User ID is required'),
  resolutionNote: z.string().min(1).max(2000),
});

export const bulkAssignSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  assigneeId: z.string().min(1, 'Assignee ID is required'),
});

export const alertIdSchema = z.object({
  id: z.string().min(1),
});

export const alertActivitySchema = z.object({
  alertId: z.string().min(1),
  action: z.enum(['CREATED', 'ACKNOWLEDGED', 'RESOLVED', 'ASSIGNED', 'NOTE_ADDED', 'ESCALATED', 'REOPENED']),
  userId: z.string().min(1),
  note: z.string().max(2000).optional(),
  metadata: recordUnknown.optional(),
});