import { z } from 'zod';

const recordUnknown = z.record(z.string(), z.unknown());

export const queryFeatureFlagsSchema = z.object({
  enabled: z.coerce.boolean().optional(),
  key: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createFeatureFlagSchema = z.object({
  key: z.string().min(1, 'Key is required').max(100).regex(/^[a-z][a-z0-9_]*$/, 'Key must start with lowercase letter and contain only lowercase letters, numbers, and underscores'),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(false),
  rolloutPercentage: z.coerce.number().int().min(0).max(100).default(0),
  conditions: recordUnknown.optional(),
});

export const updateFeatureFlagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  rolloutPercentage: z.coerce.number().int().min(0).max(100).optional(),
  conditions: recordUnknown.optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const featureFlagKeySchema = z.object({
  key: z.string().min(1),
});

export const bulkUpdateFeatureFlagsSchema = z.object({
  flags: z.array(z.object({
    key: z.string().min(1),
    enabled: z.boolean(),
  })).min(1).max(50),
});