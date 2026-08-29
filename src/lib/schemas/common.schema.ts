import { z } from './zod-extended';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const sortingSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const searchSchema = z.object({
  search: z.string().max(200).optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

export const bulkIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'At least one ID is required'),
});
