// ============================================
// AI Execution Pipeline — callLLM + parseAndValidate in one call
// Replaces the duplicated pattern in simple use cases:
//
//   const result = await callLLM([...messages], {...options});
//   return parseAndValidateAIResponse(result, schema);
//
// With:
//   return executeAI({ messages, options, schema });
// ============================================

import type { ZodSchema } from 'zod';
import type { ChatMessage, LLMCallOptions } from '@/modules/ai/providers';
import type { ExecutionContext } from './execution-context';
import { callLLM } from './llm-call';
import { parseAndValidateAIResponse } from './response-pipeline';

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

/**
 * Execute a complete AI call: LLM → parse → validate → return typed result.
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
  const result = await callLLM(opts.messages, opts.options);
  return parseAndValidateAIResponse(result, opts.schema);
}
