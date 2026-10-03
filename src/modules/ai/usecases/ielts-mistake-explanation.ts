// ============================================
// 2026-10-03 (VI): AI Use Case — IELTS Mistake Explanation
// ============================================
// Canonical pipeline (executeAI) for the advisory "explain my wrong answer"
// feature. The explanation NEVER changes a mark — scoring stays deterministic
// and server-side. Budget errors rethrow (routes map to 503); other failures
// are typed.
// ============================================

import { createHash } from 'crypto';
import { z } from 'zod';
import { executeAI } from '@/modules/ai/services/ai-execution';
import { isBudgetExceededError } from '@/modules/ai/runtime/budget-policy';
import { getLastAIProvider } from '@/modules/ai/services/ai-service';
import {
  IeltsMistakeExplanationSchema,
  type IeltsMistakeExplanationResponse,
} from '@/modules/ai/schemas/ielts-assessment-schema';
import {
  buildIeltsMistakeExplanationSystemPrompt,
  buildIeltsMistakeExplanationUserPrompt,
  IELTS_MISTAKE_EXPLANATION_V1,
  type BuildIeltsMistakeExplanationInput,
} from '@/modules/ai/prompts/ielts/mistake-explanation';

export type IeltsMistakeExplanationAiFailure =
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'AI_INVALID_JSON';

export interface IeltsMistakeExplanationAiRequest extends BuildIeltsMistakeExplanationInput {
  maxTokens?: number;
  timeoutMs?: number;
}

export type IeltsMistakeExplanationAiResult =
  | {
      ok: true;
      data: IeltsMistakeExplanationResponse;
      provider: string | null;
      durationMs: number;
      promptVersion: string;
      promptHash: string;
    }
  | {
      ok: false;
      failure: IeltsMistakeExplanationAiFailure;
      error: string;
      provider: string | null;
      durationMs: number;
      promptVersion: string;
      promptHash: string;
    };

const EXPLANATION_MAX_TOKENS = 1024;
const EXPLANATION_TIMEOUT_MS = 60_000;

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timed?\s*out|timeout|AbortError/i.test(message);
}

function classifyAiError(error: unknown): IeltsMistakeExplanationAiFailure {
  if (isTimeoutError(error)) return 'AI_PROVIDER_TIMEOUT';
  if (error instanceof z.ZodError) return 'AI_INVALID_JSON';
  const message = error instanceof Error ? error.message : String(error);
  if (/json|parse|schema/i.test(message)) return 'AI_INVALID_JSON';
  return 'AI_PROVIDER_ERROR';
}

export async function explainIeltsMistakeWithAI(
  input: IeltsMistakeExplanationAiRequest,
): Promise<IeltsMistakeExplanationAiResult> {
  const promptVersion = IELTS_MISTAKE_EXPLANATION_V1;
  const systemPrompt = buildIeltsMistakeExplanationSystemPrompt();
  const userPrompt = buildIeltsMistakeExplanationUserPrompt({
    skill: input.skill,
    questionType: input.questionType,
    prompt: input.prompt,
    options: input.options,
    correctAnswer: input.correctAnswer,
    acceptedAnswers: input.acceptedAnswers,
    itemExplanation: input.itemExplanation,
    studentAnswer: input.studentAnswer,
    passageText: input.passageText,
    transcriptText: input.transcriptText,
    language: input.language,
  });
  const promptHash = createHash('sha256').update(`${systemPrompt}\n---\n${userPrompt}`).digest('hex');

  const started = Date.now();
  try {
    const data = await executeAI<IeltsMistakeExplanationResponse>({
      context: {
        feature: 'IELTS',
        useCase: 'IeltsMistakeExplanation',
        promptName: 'IeltsMistakeExplanation',
        promptVersion: 'v1',
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: 0.2,
        maxTokens: input.maxTokens ?? EXPLANATION_MAX_TOKENS,
        timeoutMs: input.timeoutMs ?? EXPLANATION_TIMEOUT_MS,
        jsonMode: true,
      },
      schema: IeltsMistakeExplanationSchema,
    });
    return {
      ok: true,
      data,
      provider: getLastAIProvider() ?? null,
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
