import { z, ZodSchema, ZodError } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { ValidationError } from '@/lib/api-response';

export type ValidationTarget = 'body' | 'query' | 'params' | 'headers';

export interface ValidatedRequest<T = unknown> {
  body?: T;
  query?: T;
  params?: T;
  headers?: T;
}

export function validateRequest<T extends ZodSchema>(
  schema: T,
  target: ValidationTarget = 'body'
) {
  return async (request: NextRequest): Promise<z.infer<T>> => {
    let data: unknown;

    switch (target) {
      case 'body':
        try {
          data = await request.json();
        } catch {
          throw new ValidationError('Invalid JSON body');
        }
        break;
      case 'query':
        data = Object.fromEntries(request.nextUrl.searchParams);
        break;
      case 'params':
        data = {};
        break;
      case 'headers':
        data = Object.fromEntries(request.headers);
        break;
      default:
        throw new Error(`Unknown validation target: ${target}`);
    }

    const result = schema.safeParse(data);

    if (!result.success) {
      const details = formatZodError(result.error);
      throw new ValidationError('Validation failed', details);
    }

    return result.data;
  };
}

export function validateQuery<T extends ZodSchema>(schema: T) {
  return validateRequest(schema, 'query');
}

export function validateParams<T extends ZodSchema>(schema: T) {
  return validateRequest(schema, 'params');
}

export function validateHeaders<T extends ZodSchema>(schema: T) {
  return validateRequest(schema, 'headers');
}

export function formatZodError(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    const message = issue.message;

    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(message);
  }

  return formatted;
}

export function parseQueryParams(searchParams: URLSearchParams): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  for (const [key, value] of searchParams.entries()) {
    if (params[key] !== undefined) {
      if (Array.isArray(params[key])) {
        (params[key] as unknown[]).push(value);
      } else {
        params[key] = [params[key], value];
      }
    } else {
      params[key] = value;
    }
  }

  return params;
}

export async function withValidation<T extends ZodSchema>(
  request: NextRequest,
  schema: T,
  target: ValidationTarget = 'body'
): Promise<z.infer<T>> {
  const validator = validateRequest(schema, target);
  return validator(request);
}

export function createValidator<T extends ZodSchema>(schema: T, target: ValidationTarget = 'body') {
  return async (request: NextRequest) => {
    return validateRequest(schema, target)(request);
  };
}

export class RequestValidator {
  private validators: Map<ValidationTarget, ZodSchema> = new Map();

  body<T extends ZodSchema>(schema: T): this {
    this.validators.set('body', schema);
    return this;
  }

  query<T extends ZodSchema>(schema: T): this {
    this.validators.set('query', schema);
    return this;
  }

  params<T extends ZodSchema>(schema: T): this {
    this.validators.set('params', schema);
    return this;
  }

  headers<T extends ZodSchema>(schema: T): this {
    this.validators.set('headers', schema);
    return this;
  }

  async validate(request: NextRequest): Promise<ValidatedRequest> {
    const validated: ValidatedRequest = {};

    for (const [target, schema] of this.validators) {
      const validator = validateRequest(schema, target);
      validated[target as keyof ValidatedRequest] = await validator(request);
    }

    return validated;
  }
}

export function validator() {
  return new RequestValidator();
}