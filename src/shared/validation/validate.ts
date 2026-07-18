// Sprint 6: Request Validation Helper
// Wraps Zod schema parsing for API routes — consistent error format
import { ZodSchema, ZodError } from 'zod';
import { NextResponse } from 'next/server';

export interface ValidationResult<T> {
  success: true;
  data: T;
}

export interface ValidationError {
  success: false;
  error: string;
  details?: Array<{ field: string; message: string }>;
}

/**
 * Validate request body against a Zod schema.
 * Returns parsed data on success, or throws a 400 response on failure.
 *
 * Usage:
 *   const parsed = validateRequest(MySchema, await request.json());
 *   // parsed is typed — no more `if (!body.xxx)` checks needed
 */
export function validateRequest<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = formatZodErrors(result.error);
    throw NextResponse.json(
      { error: '請求資料格式不正確', details },
      { status: 400 }
    );
  }
  return result.data;
}

/** Parse query params against a Zod schema */
export function validateQuery<T>(schema: ZodSchema<T>, params: URLSearchParams): T {
  const obj: Record<string, string> = {};
  params.forEach((v, k) => { obj[k] = v; });
  return validateRequest(schema, obj);
}

/** Format ZodError into user-friendly details */
function formatZodErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map(e => ({
    field: e.path.join('.'),
    message: e.message,
  }));
}
