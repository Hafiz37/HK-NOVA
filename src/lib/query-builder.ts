import { Prisma } from '@prisma/client';
import { z } from 'zod';

export const advancedFilterSchema = z.object({
  filters: z.record(z.string(), z.unknown()).optional(),
  fields: z.string().optional(),
  include: z.string().optional(),
  search: z.string().max(200).optional(),
  searchFields: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  dateField: z.string().default('createdAt'),
});

export type AdvancedFilters = z.infer<typeof advancedFilterSchema>;

export interface QueryOptions {
  page?: number;
  limit?: number;
  cursor?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  useCursor?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page?: number;
    limit: number;
    total?: number;
    totalPages?: number;
    hasNext: boolean;
    hasPrev?: boolean;
    cursor?: string;
  };
}

function parseFilterValue(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const operators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'startsWith', 'endsWith', 'not'];
    const hasOperator = Object.keys(obj).some(k => operators.includes(k));
    if (hasOperator) return value;
  }
  return { eq: value };
}

function buildWhereClause(filters: Record<string, unknown>, search?: string, searchFields?: string[], dateFrom?: Date, dateTo?: Date, dateField: string = 'createdAt'): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      const parsed = parseFilterValue(value);
      if (typeof parsed === 'object' && parsed !== null) {
        const conditions = parsed as Record<string, unknown>;
        if (Object.keys(conditions).length === 1 && conditions.eq !== undefined) {
          where[key] = conditions.eq;
        } else {
          where[key] = conditions;
        }
      } else {
        where[key] = parsed;
      }
    }
  }

  if (search && searchFields && searchFields.length > 0) {
    where.OR = searchFields.map(field => ({
      [field]: { contains: search, mode: 'insensitive' as const },
    }));
  }

  if (dateFrom || dateTo) {
    where[dateField] = {};
    if (dateFrom) (where[dateField] as Record<string, Date>).gte = dateFrom;
    if (dateTo) (where[dateField] as Record<string, Date>).lte = dateTo;
  }

  return where;
}

function buildSelect(fields?: string): Record<string, boolean> | undefined {
  if (!fields) return undefined;
  const fieldList = fields.split(',').map(f => f.trim()).filter(Boolean);
  const select: Record<string, boolean> = {};
  for (const field of fieldList) {
    select[field] = true;
  }
  return select;
}

function buildInclude(include?: string): Record<string, boolean> | undefined {
  if (!include) return undefined;
  const includeList = include.split(',').map(i => i.trim()).filter(Boolean);
  const includeObj: Record<string, boolean> = {};
  for (const inc of includeList) {
    includeObj[inc] = true;
  }
  return includeObj;
}

export function buildPrismaQuery(
  params: AdvancedFilters & QueryOptions,
  options: {
    defaultSortBy?: string;
    defaultSortOrder?: 'asc' | 'desc';
    searchableFields?: string[];
    cursorField?: string;
    dateField?: string;
  } = {}
): {
  where: Record<string, unknown>;
  select?: Record<string, boolean>;
  include?: Record<string, boolean>;
  orderBy: Record<string, 'asc' | 'desc'>;
  skip?: number;
  take: number;
  cursor?: Record<string, string>;
} {
  const {
    defaultSortBy = 'createdAt',
    defaultSortOrder = 'desc',
    searchableFields = [],
    cursorField = 'id',
    dateField = 'createdAt',
  } = options;

  const {
    filters,
    fields,
    include,
    search,
    searchFields,
    dateFrom,
    dateTo,
    page = 1,
    limit = 50,
    cursor,
    sortBy = defaultSortBy,
    sortOrder = defaultSortOrder,
    useCursor = false,
  } = params;

  const where = buildWhereClause(
    filters || {},
    search,
    searchFields ? searchFields.split(',') : searchableFields,
    dateFrom,
    dateTo,
    dateField
  );

  const select = buildSelect(fields);
  const includeObj = buildInclude(include);

  const orderBy: Record<string, 'asc' | 'desc'> = {};
  orderBy[sortBy] = sortOrder;

  const take = Math.min(Math.max(limit, 1), 100);

  if (useCursor && cursor) {
    return {
      where,
      select,
      include: includeObj,
      orderBy,
      take,
      cursor: { [cursorField]: cursor },
    };
  }

  const skip = useCursor ? 0 : (page - 1) * take;

  return {
    where,
    select,
    include: includeObj,
    orderBy,
    skip,
    take,
  };
}

export async function executePaginatedQuery<T, TArgs extends { where?: unknown; select?: unknown; include?: unknown; orderBy?: unknown; skip?: number; take: number; cursor?: unknown }>(
  queryFn: (args: TArgs) => Promise<T[]>,
  countFn: (where: unknown) => Promise<number>,
  params: AdvancedFilters & QueryOptions,
  options: {
    defaultSortBy?: string;
    defaultSortOrder?: 'asc' | 'desc';
    searchableFields?: string[];
    cursorField?: string;
    dateField?: string;
  } = {}
): Promise<PaginatedResult<T>> {
  const {
    page = 1,
    limit = 50,
    cursor,
    useCursor = false,
  } = params;

  const take = Math.min(Math.max(limit, 1), 100);
  const query = buildPrismaQuery(params, options);

  const [data, total] = await Promise.all([
    queryFn(query as TArgs),
    useCursor || !cursor ? countFn(query.where) : Promise.resolve(undefined),
  ]);

  let hasNext = false;
  let nextCursor: string | undefined;

  if (useCursor) {
    hasNext = data.length > take;
    if (hasNext) {
      const lastItem = data[data.length - 1] as Record<string, unknown>;
      nextCursor = String(lastItem[options.cursorField || 'id']);
      data.pop();
    }
  } else {
    const totalPages = total ? Math.ceil(total / take) : 0;
    hasNext = page < totalPages;
  }

  return {
    data,
    pagination: useCursor
      ? { limit: take, hasNext, cursor: nextCursor }
      : { page, limit: take, total: total || 0, totalPages: total ? Math.ceil(total / take) : 0, hasNext, hasPrev: page > 1 },
  };
}

export function parseAdvancedFilters(searchParams: URLSearchParams): AdvancedFilters {
  const filters: Record<string, unknown> = {};
  
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('filter.')) {
      const field = key.slice(7);
      try {
        filters[field] = JSON.parse(value);
      } catch {
        filters[field] = value;
      }
    }
  }

  return {
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    fields: searchParams.get('fields') || undefined,
    include: searchParams.get('include') || undefined,
    search: searchParams.get('search') || undefined,
    searchFields: searchParams.get('searchFields') || undefined,
    dateFrom: searchParams.get('dateFrom') ? new Date(searchParams.get('dateFrom')!) : undefined,
    dateTo: searchParams.get('dateTo') ? new Date(searchParams.get('dateTo')!) : undefined,
    dateField: searchParams.get('dateField') || 'createdAt',
  };
}