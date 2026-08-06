// ============================================
// AI Execution Pipeline — callLLM + parseAndValidate in one call
//
// Now delegates to the composable middleware pipeline:
//
//   executeAI()
//       ↓
//   AIExecutionPipeline.run(context)
//       ↓
//   CallLLMMiddleware  → context.rawResponse
//       ↓
//   ParseMiddleware    → context.parsed
//       ↓
//   ValidationMiddleware → context.result
//       ↓
//   return context.result as T
//
// ============================================

import type { ZodSchema } from 'zod';
import type { ChatMessage, LLMCallOptions } from '@/modules/ai/providers';
import type { ExecutionContext } from './execution-context';
import { AIExecutionPipeline } from './middleware/pipeline';
import { CallLLMMiddleware, ParseMiddleware, ValidationMiddleware } from './middleware/built-in';
import type { AIExecutionContext } from './middleware/middleware';

export interface ExecuteAIOptions<T> {
  /** Execution metadata for future telemetry/tracing */
  context: ExecutionContext;
  /** Chat messages (system + user) */
  messages: ChatMessage[];
  /** LLM call options (temperature, maxTokens, jsonMode, timeout, etc.) */
  options?: LLMCallOptions;
  /** Zod schema for response validation */
  schema: ZodSchema<T>;
}

// Default pipeline — CallLLM → Parse → Validate
const defaultPipeline = new AIExecutionPipeline([
  CallLLMMiddleware,
  ParseMiddleware,
  ValidationMiddleware,
]);

/**
 * Execute a complete AI call through the middleware pipeline.
 * Byte-identical to the previous inline implementation.
 *
 * @example
 * const analysis = await executeAI({
 *   context: { feature: 'Writing', useCase: 'AnalyzeAnswer', promptName: 'AnswerAnalysis' },
 *   messages: [
 *     { role: 'system', content: systemPrompt },
 *     { role: 'user', content: userPrompt },
 *   ],
 *   options: { temperature: 0.3, maxTokens: 2048, jsonMode: true },
 *   schema: AnswerAnalysisSchema,
 * });
 */
export async function executeAI<T>(
  opts: ExecuteAIOptions<T>,
): Promise<T> {
  const context: AIExecutionContext = {
    messages: opts.messages,
    options: opts.options,
    schema: opts.schema as ZodSchema,
    executionContext: opts.context,
    rawResponse: null,
    parsed: null,
    validated: null,
    result: null,
  };

  await defaultPipeline.run(context);

  return context.result as T;
}

// ============================================
// executeAIRaw — for string-output use cases
// ============================================

export interface ExecuteAIRawOptions {
  /** Execution metadata */
  context: ExecutionContext;
  /** Chat messages */
  messages: ChatMessage[];
  /** LLM call options */
  options?: LLMCallOptions;
}

/** Pipeline with only CallLLM — no parsing, no validation */
const rawPipeline = new AIExecutionPipeline([CallLLMMiddleware]);

/**
 * Execute an AI call that returns raw text (not JSON).
 * Used by writing-prompt and writing-outline use cases.
 */
export async function executeAIRaw(
  opts: ExecuteAIRawOptions,
): Promise<string> {
  const context: AIExecutionContext = {
    messages: opts.messages,
    options: opts.options,
    schema: undefined as unknown as ZodSchema,
    executionContext: opts.context,
    rawResponse: null,
    parsed: null,
    validated: null,
    result: null,
  };

  await rawPipeline.run(context);

  return context.rawResponse ?? '';
}
