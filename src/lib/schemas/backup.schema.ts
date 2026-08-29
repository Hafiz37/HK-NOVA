import { z } from './zod-extended';

export const createBackupSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  triggerType: z.enum(['MANUAL', 'SCHEDULED']).default('MANUAL'),
});

export const queryBackupSchema = z.object({
  deviceId: z.string().optional(),
  status: z.enum(['SUCCESS', 'FAILED', 'IN_PROGRESS']).optional(),
  triggerType: z.enum(['MANUAL', 'SCHEDULED']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['createdAt', 'status', 'triggerType']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const restoreBackupSchema = z.object({
  backupId: z.string().min(1, 'Backup ID is required'),
  confirm: z.boolean().refine(val => val === true, 'Confirmation required'),
});

export const backupIdSchema = z.object({
  id: z.string().min(1),
});

export const queryBackupSearchSchema = z.object({
  q: z.string().max(200).optional(),
  deviceId: z.string().optional(),
  status: z.enum(['SUCCESS', 'FAILED', 'IN_PROGRESS']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const bulkCreateBackupSchema = z.object({
  deviceIds: z.array(z.string().min(1)).min(1).max(50),
  triggerType: z.enum(['MANUAL', 'SCHEDULED']).default('MANUAL'),
});

export const bulkDeleteBackupSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  confirm: z.boolean().refine(val => val === true, 'Confirmation required'),
});

export const bulkRestoreBackupSchema = z.object({
  items: z.array(z.object({
    backupId: z.string().min(1),
    confirm: z.boolean().refine(val => val === true, 'Confirmation required'),
  })).min(1).max(20),
});