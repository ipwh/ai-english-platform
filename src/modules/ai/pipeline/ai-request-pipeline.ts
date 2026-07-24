// Sprint 83: AI Request Pipeline — canonical orchestration for all AI calls
// All use cases compose their logic; the pipeline handles the execution lifecycle.

import { providerRegistry } from '@/modules/ai/providers';
import type { ChatMessage } from '@/modules/ai/providers';
import { parseAIResponse } from '../services/response-parser';
import { executeWithRetry } from '../services/retry';
import { logger } from '@/shared/logger/logger';
import type { ZodSchema } from 'zod';
import type { PipelineContext } from './pipeline-context';
import type { PipelineResult, StageTiming } from './pipeline-types';

export async function executeAIPipeline<T>(
  messages: ChatMessage[],
  schema: ZodSchema<T>,
  context: PipelineContext,
): Promise<PipelineResult<T>> {
  const startTime = Date.now();
  const stages: StageTiming[] = [];
  const warnings: string[] = [];
  let repaired = false;

  const record = (stage: StageTiming['stage'], startedAt: number, success: boolean, error?: string) => {
    stages.push({ stage, startedAt, durationMs: Date.now() - startedAt, success, error });
  };

  // Stage 1: Provider call with retry
  const providerStart = Date.now();
  let providerUsed = 'unknown';
  let retryCount = 0;
  let cacheHit = false;

  const rawResult = await executeWithRetry(async (attempt) => {
    retryCount = attempt;
    const result = await providerRegistry.call(messages, {
      temperature: context.options.temperature,
      maxTokens: context.options.maxTokens,
      jsonMode: context.options.jsonMode,
      timeoutMs: context.options.timeoutMs,
      userId: context.userId,
    });
    providerUsed = result.provider || 'unknown';
    return result;
  }, {
    maxRetries: context.options.maxRetries ?? 2,
    onRetry: (attempt, error) => {
      warnings.push(`Retry ${attempt}: ${error.slice(0, 100)}`);
    },
  });

  record('provider', providerStart, true);

  // Stage 2: Parse + validate
  const parseStart = Date.now();
  const parseResult = parseAIResponse<T>(rawResult.text, schema);
  record('parser', parseStart, parseResult.success, parseResult.error);
  if (parseResult.repaired) {
    repaired = true;
    warnings.push('AI response was repaired (truncated JSON)');
  }

  if (!parseResult.success || !parseResult.data) {
    const err = parseResult.error || 'Pipeline: response validation failed';
    record('validation', Date.now(), false, err);
    throw new Error(err);
  }
  record('validation', parseStart + 1, true);

  return {
    data: parseResult.data,
    provider: providerUsed,
    cacheHit,
    totalLatencyMs: Date.now() - startTime,
    retryCount,
    repaired,
    stages,
    warnings,
  };
}
