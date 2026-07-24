// Sprint 81: Response Parser — canonical JSON parsing + validation for AI responses
// All use cases delegate JSON parsing and schema validation here.

import { parseAIJSON, repairTruncatedJSON } from './json-utils';
import type { ZodSchema } from 'zod';
import { logger } from '@/shared/logger/logger';

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  repaired?: boolean;
}

/**
 * Parse and validate an AI response.
 * Attempts direct parse first, then JSON repair if it fails.
 */
export function parseAIResponse<T>(
  raw: string,
  schema: ZodSchema<T>,
): ParseResult<T> {
  // Try direct parse
  try {
    const parsed = parseAIJSON<T>(raw);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { success: true, data: result.data };
    }
    // Schema validation failed — try repair
    logger.warn({ module: 'response-parser', error: result.error.message.slice(0, 100) }, 'Schema validation failed, attempting repair');
  } catch (err) {
    logger.warn({ module: 'response-parser', error: String(err).slice(0, 100) }, 'JSON parse failed, attempting repair');
  }

  // Try repair
  const repaired = repairTruncatedJSON(raw);
  if (repaired) {
    try {
      const parsed = parseAIJSON<T>(repaired);
      const result = schema.safeParse(parsed);
      if (result.success) {
        return { success: true, data: result.data, repaired: true };
      }
      return { success: false, error: result.error.message };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  return { success: false, error: 'Failed to parse or repair AI response' };
}

/**
 * Validate AI response with a Zod schema, throwing on failure.
 * Convenience wrapper for use cases that prefer exceptions.
 */
export function validateAIResponseStrict<T>(
  raw: string,
  schema: ZodSchema<T>,
): T {
  const result = parseAIResponse(raw, schema);
  if (!result.success || !result.data) {
    throw new Error(result.error || 'AI response validation failed');
  }
  return result.data;
}
