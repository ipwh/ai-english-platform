// ============================================
// 2026-10-03 (II): AI Use Case — IELTS Speaking PREPARATION Coach
// ============================================
// Replaces the previous transcript-based Speaking assessment. The platform no
// longer produces Speaking scores/bands (product decision): this use case only
// generates preparation material. The response schema has no score fields.
// ============================================

import { createHash } from 'crypto';
import { z } from 'zod';
import { executeAI } from '@/modules/ai/services/ai-execution';
import { isBudgetExceededError } from '@/modules/ai/runtime/budget-policy';
import { getLastAIProvider } from '@/modules/ai/services/ai-service';
import {
  IeltsSpeakingPrepSchema,
  type IeltsSpeakingPrepResponse,
} from '@/modules/ai/schemas/ielts-assessment-schema';
import {
  buildIeltsSpeakingPrepSystemPrompt,
  buildIeltsSpeakingPrepUserPrompt,
  IELTS_SPEAKING_PREP_PROMPT_VERSION,
} from '@/modules/ai/prompts/ielts/speaking-preparation';
import { isTimeoutError } from '@/modules/ai/usecases/ielts-writing-assessment';

export type IeltsSpeakingPrepAiFailure =
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'AI_INVALID_JSON';

export interface IeltsSpeakingPrepAiRequest {
  partLabel: string;
  partDescription: string;
  topicPrompt: string;
  studentNotes?: string;
  platformNotes?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

export type IeltsSpeakingPrepAiResult =
  | {
      ok: true;
      data: IeltsSpeakingPrepResponse;
      provider: string | null;
      durationMs: number;
      promptVersion: string;
      promptHash: string;
    }
  | {
      ok: false;
      failure: IeltsSpeakingPrepAiFailure;
      error: string;
      provider: string | null;
      durationMs: number;
      promptVersion: string;
      promptHash: string;
    };

const PREP_MAX_TOKENS = 3072;
const PREP_TIMEOUT_MS = 120_000;

function classifyAiError(error: unknown): IeltsSpeakingPrepAiFailure {
  if (isTimeoutError(error)) return 'AI_PROVIDER_TIMEOUT';
  if (error instanceof z.ZodError) return 'AI_INVALID_JSON';
  const message = error instanceof Error ? error.message : String(error);
  if (/json|parse|schema/i.test(message)) return 'AI_INVALID_JSON';
  return 'AI_PROVIDER_ERROR';
}

export async function prepareIeltsSpeakingWithAI(
  input: IeltsSpeakingPrepAiRequest,
): Promise<IeltsSpeakingPrepAiResult> {
  const promptVersion = IELTS_SPEAKING_PREP_PROMPT_VERSION;
  const systemPrompt = buildIeltsSpeakingPrepSystemPrompt(input.partLabel);
  const userPrompt = buildIeltsSpeakingPrepUserPrompt({
    partLabel: input.partLabel,
    partDescription: input.partDescription,
    topicPrompt: input.topicPrompt,
    studentNotes: input.studentNotes,
    platformNotes: input.platformNotes,
  });
  const promptHash = createHash('sha256').update(`${systemPrompt}\n---\n${userPrompt}`).digest('hex');

  const started = Date.now();
  try {
    const data = await executeAI<IeltsSpeakingPrepResponse>({
      context: {
        feature: 'IELTS',
        useCase: 'IeltsSpeakingPreparation',
        promptName: 'IeltsSpeakingPreparation',
        promptVersion: 'v1',
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: 0.4,
        maxTokens: input.maxTokens ?? PREP_MAX_TOKENS,
        timeoutMs: input.timeoutMs ?? PREP_TIMEOUT_MS,
        jsonMode: true,
      },
      schema: IeltsSpeakingPrepSchema,
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
