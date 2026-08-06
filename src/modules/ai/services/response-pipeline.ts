// ============================================
// AI Response Pipeline — parse + validate in one call
// Replaces the duplicated pattern in 10+ use cases:
//
//   const parsed = parseAIJSON(result);
//   const validated = validateAIResponse(schema, parsed);
//   if (!validated.success) throw new Error(validated.error);
//   return validated.data;
//
// With:
//   return parseAndValidateAIResponse(result, schema);
// ============================================

import type { ZodSchema } from 'zod';
import { parseAIJSON } from './json-utils';
import { validateAIResponse } from '../schemas/ai-schema';

/**
 * Parse raw LLM output and validate against a Zod schema.
 * Combines parseAIJSON() + validateAIResponse() into one call.
 *
 * @throws Error if parsing or validation fails
 */
export function parseAndValidateAIResponse<T>(
  raw: string,
  schema: ZodSchema<T>,
): T {
  const parsed = parseAIJSON<T>(raw);
  const validated = validateAIResponse(schema, parsed);
  if (!validated.success) {
    throw new Error(validated.error);
  }
  return validated.data;
}
