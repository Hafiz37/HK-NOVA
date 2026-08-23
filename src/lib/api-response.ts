export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    statusCode: number;
    timestamp: string;
    path?: string;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CursorPaginationMeta {
  cursor?: string;
  limit: number;
  total?: number;
  hasNext: boolean;
}

export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    code: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toResponse(path?: string): ApiErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        statusCode: this.statusCode,
        timestamp: new Date().toISOString(),
        path,
      },
    };
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    super(404, `${resource}${id ? ` with ID ${id}` : ''} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(409, message, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter?: number) {
    super(429, 'Too many requests', 'RATE_LIMIT_EXCEEDED', { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal server error', details?: unknown) {
    super(500, message, 'INTERNAL_ERROR', details);
    this.name = 'InternalServerError';
  }
}

export function success<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return { success: true, data, meta };
}

export function error(err: Error | ApiError, path?: string): ApiErrorResponse {
  if (err instanceof ApiError) {
    return err.toResponse(path);
  }
  const apiError = new InternalServerError(err.message);
  return apiError.toResponse(path);
}

export function paginated<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): ApiResponse<T[]> & { meta: { pagination: PaginationMeta } } {
  const totalPages = Math.ceil(total / limit);
  return {
    success: true,
    data,
    meta: {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
  };
}

export function cursorPaginated<T>(
  data: T[],
  cursor: string | undefined,
  limit: number,
  hasNext: boolean,
  total?: number
): ApiResponse<T[]> & { meta: { pagination: CursorPaginationMeta } } {
  return {
    success: true,
    data,
    meta: {
      pagination: {
        cursor,
        limit,
        total,
        hasNext,
      },
    },
  };
}

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RESOURCE_LOCKED: 'RESOURCE_LOCKED',
  OPERATION_FAILED: 'OPERATION_FAILED',
} as const;