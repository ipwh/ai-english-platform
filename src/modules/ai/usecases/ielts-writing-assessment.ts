// ============================================
// 2026-10-03 PHASE IELTS-01: AI Use Case — IELTS Writing Assessment
// ============================================
// Canonical pipeline (executeAI) with a versioned, criterion-specific prompt.
// This use case performs the raw AI call + schema parse ONLY. Semantic
// validation (band legality, evidence-quote verification, requirement coverage)
// happens in the IELTS module (`services/writing-assessment-service.ts`) so
// typed failure codes are produced there.
//
// Errors:
//   * BudgetExceededError is rethrown untouched (routes map it to 503)
//   * all other failures are returned as typed failures (never thrown as a
//     generic Error that callers might mistake for a successful empty result)
// ============================================

import { createHash } from 'crypto';
import { z } from 'zod';
import { executeAI } from '@/modules/ai/services/ai-execution';
import { isBudgetExceededError } from '@/modules/ai/runtime/budget-policy';
import { getLastAIProvider } from '@/modules/ai/services/ai-service';
import {
  IeltsWritingAssessmentSchema,
  type IeltsWritingAssessmentResponse,
} from '@/modules/ai/schemas/ielts-assessment-schema';
import {
  buildIeltsWritingAssessmentSystemPrompt,
  buildIeltsWritingAssessmentUserPrompt,
  writingPromptVersionFor,
  type IeltsWritingTaskTypeName,
} from '@/modules/ai/prompts/ielts/writing-assessment';

export type IeltsWritingAiFailure =
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'AI_INVALID_JSON';

export interface IeltsWritingAiRequest {
  taskType: IeltsWritingTaskTypeName;
  taskPrompt: string;
  essay: string;
  requirements: Array<{ id: string; label: string }>;
  wordCount: number;
  minWords: number;
  /** Deterministic platform task-type analysis injected into the prompt. */
  taskTypeNote?: string;
  /** Optional overrides (tests / future tuning). */
  timeoutMs?: number;
  maxTokens?: number;
}

export type IeltsWritingAiResult =
  | {
      ok: true;
      data: IeltsWritingAssessmentResponse;
      provider: string | null;
      durationMs: number;
      promptVersion: string;
      promptHash: string;
      model: string | null;
    }
  | {
      ok: false;
      failure: IeltsWritingAiFailure;
      error: string;
      provider: string | null;
      durationMs: number;
      promptVersion: string;
      promptHash: string;
    };

const WRITING_MAX_TOKENS = 4096;
const WRITING_TIMEOUT_MS = 120_000;

export function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timed?\s*out|timeout|AbortError/i.test(message);
}

function classifyAiError(error: unknown): IeltsWritingAiFailure {
  if (isTimeoutError(error)) return 'AI_PROVIDER_TIMEOUT';
  if (error instanceof z.ZodError) return 'AI_INVALID_JSON';
  const message = error instanceof Error ? error.message : String(error);
  if (/json|parse|schema/i.test(message)) return 'AI_INVALID_JSON';
  return 'AI_PROVIDER_ERROR';
}

export async function assessIeltsWritingWithAI(
  input: IeltsWritingAiRequest,
): Promise<IeltsWritingAiResult> {
  const promptVersion = writingPromptVersionFor(input.taskType);
  const systemPrompt = buildIeltsWritingAssessmentSystemPrompt(input.taskType);
  const userPrompt = buildIeltsWritingAssessmentUserPrompt({
    taskType: input.taskType,
    taskPrompt: input.taskPrompt,
    essay: input.essay,
    requirements: input.requirements,
    wordCount: input.wordCount,
    minWords: input.minWords,
    taskTypeNote: input.taskTypeNote,
  });
  const promptHash = createHash('sha256').update(`${systemPrompt}\n---\n${userPrompt}`).digest('hex');

  const started = Date.now();
  try {
    const data = await executeAI<IeltsWritingAssessmentResponse>({
      context: {
        feature: 'IELTS',
        useCase: 'IeltsWritingAssessment',
        promptName: 'IeltsWritingAssessment',
        promptVersion: 'v1',
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: 0.2,
        maxTokens: input.maxTokens ?? WRITING_MAX_TOKENS,
        timeoutMs: input.timeoutMs ?? WRITING_TIMEOUT_MS,
        jsonMode: true,
      },
      schema: IeltsWritingAssessmentSchema,
    });

    const provider = getLastAIProvider() ?? null;
    return {
      ok: true,
      data,
      provider,
      model: null, // provider-name only; model id is not reliably exposed per call
      durationMs: Date.now() - started,
      promptVersion,
      promptHash,
    };
  } catch (error) {
    // Budget exhaustion must keep its identity so routes can map to 503.
    if (isBudgetExceededError(error)) throw error;
    return {
      ok: false,
      failure: classifyAiError(error),
      error: error instanceof Error ? error.message : String(error),
      provider: getLastAIProvider() ?? null,
      durationMs: Date.now() - started,
      promptVersion,
      promptHash,
    };
  }
}
