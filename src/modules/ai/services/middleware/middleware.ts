// ============================================
// Middleware interface & execution context
//
// AIExecutionMiddleware: composable pipeline step
// AIExecutionContext: typed bag carrying state through the pipeline
//
// No any types — all intermediate state uses `unknown`.
// ============================================

import type { ZodSchema } from 'zod';
import type { ChatMessage, LLMCallOptions } from '@/modules/ai/providers';
import type { ExecutionContext } from '../execution-context';
import type { ValidationResult } from '../../schemas/ai-schema';

// ============================================
// AIExecutionContext — typed state bag
// ============================================

export interface AIExecutionContext {
  // ── Input (set by executeAI caller) ──
  messages: ChatMessage[];
  options?: LLMCallOptions;
  schema: ZodSchema;
  executionContext: ExecutionContext;

  // ── Pipeline state (populated by middlewares) ──
  rawResponse: string | null;
  parsed: unknown | null;
  validated: ValidationResult<unknown> | null;

  // ── Output (set by final middleware) ──
  result: unknown | null;
}

// ============================================
// AIExecutionMiddleware — composable step
// ============================================

export interface AIExecutionMiddleware {
  /**
   * Execute this middleware step.
   *
   * @param context — mutable state bag shared across the pipeline
   * @param next    — call to proceed to the next middleware in chain
   */
  execute(
    context: AIExecutionContext,
    next: () => Promise<void>,
  ): Promise<void>;
}
