import { z } from 'zod';

export const querySettingsSchema = z.object({
  category: z.string().optional(),
  key: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const updateSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
  category: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  type: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON']),
  isPublic: z.boolean().default(false),
  isSensitive: z.boolean().default(false),
});

export const createSettingSchema = updateSettingSchema;

export const settingKeySchema = z.object({
  key: z.string().min(1),
});