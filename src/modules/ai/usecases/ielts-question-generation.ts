// ============================================
// 2026-10-03 PHASE IELTS-01 (IV): AI Use Cases — IELTS Question Generation & Verification
// ============================================
// Canonical pipeline (executeAI) for the four generation-related AI calls:
//   1. generateIeltsQuestionSetWithAI  — author one objective practice set
//   2. verifyIeltsItemsWithAI          — independent BLIND-SOLVE verification
//                                        (answer keys are never sent)
//   3. generateIeltsWritingPromptWithAI— author one Writing task prompt
//   4. verifyIeltsWritingPromptWithAI  — independent conformance check
//
// The AI output is RAW until the IELTS module screens it; nothing here persists
// or publishes anything.
//
// Errors:
//   * BudgetExceededError is rethrown untouched (routes map it to 503)
//   * all other failures are typed (never thrown as a generic Error)
// ============================================

import { createHash } from 'crypto';
import { z } from 'zod';
import { executeAI } from '@/modules/ai/services/ai-execution';
import { isBudgetExceededError } from '@/modules/ai/runtime/budget-policy';
import { getLastAIProvider } from '@/modules/ai/services/ai-service';
import {
  IeltsGeneratedItemsSchema,
  IeltsGeneratedSetSchema,
  IeltsItemVerificationSchema,
  IeltsWritingPromptGenerationSchema,
  IeltsWritingPromptVerificationSchema,
  type IeltsGeneratedItems,
  type IeltsGeneratedSet,
  type IeltsItemVerificationResponse,
  type IeltsWritingPromptGeneration,
  type IeltsWritingPromptVerification,
} from '@/modules/ai/schemas/ielts-generation-schema';
import {
  buildIeltsItemVerificationSystemPrompt,
  buildIeltsItemVerificationUserPrompt,
  buildIeltsQuestionGenerationSystemPrompt,
  buildIeltsQuestionGenerationUserPrompt,
  buildIeltsSectionExtensionSystemPrompt,
  buildIeltsSectionExtensionUserPrompt,
  buildIeltsWritingGenerationSystemPrompt,
  buildIeltsWritingGenerationUserPrompt,
  buildIeltsWritingVerificationSystemPrompt,
  buildIeltsWritingVerificationUserPrompt,
  IELTS_ITEM_VERIFICATION_V1,
  IELTS_QUESTION_GENERATION_V1,
  IELTS_SECTION_EXTENSION_V1,
  IELTS_WRITING_PROMPT_GENERATION_V1,
  IELTS_WRITING_PROMPT_VERIFICATION_V1,
  type BuildIeltsGenerationUserPromptInput,
  type BuildIeltsItemVerificationUserPromptInput,
  type BuildIeltsSectionExtensionUserPromptInput,
  type IeltsGenSkill,
  type IeltsGenTestType,
  type IeltsWritingTaskTypeName,
} from '@/modules/ai/prompts/ielts/question-generation';

export type IeltsGenerationAiFailure =
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'AI_INVALID_JSON';

export interface IeltsGenerationMeta {
  provider: string | null;
  durationMs: number;
  promptVersion: string;
  promptHash: string;
}

export type IeltsGenerationAiResult<T> =
  | ({ ok: true; data: T } & IeltsGenerationMeta)
  | ({ ok: false; failure: IeltsGenerationAiFailure; error: string } & IeltsGenerationMeta);

// ============================================
// Shared plumbing
// ============================================

function hashPrompts(systemPrompt: string, userPrompt: string): string {
  return createHash('sha256').update(`${systemPrompt}\n---\n${userPrompt}`).digest('hex');
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timed?\s*out|timeout|AbortError/i.test(message);
}

function classifyAiError(error: unknown): IeltsGenerationAiFailure {
  if (isTimeoutError(error)) return 'AI_PROVIDER_TIMEOUT';
  if (error instanceof z.ZodError) return 'AI_INVALID_JSON';
  const message = error instanceof Error ? error.message : String(error);
  if (/json|parse|schema/i.test(message)) return 'AI_INVALID_JSON';
  return 'AI_PROVIDER_ERROR';
}

async function runGenerationCall<T>(args: {
  context: { useCase: string; promptName: string };
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  promptVersion: string;
  overrides?: { maxTokens?: number; timeoutMs?: number };
}): Promise<IeltsGenerationAiResult<T>> {
  const promptHash = hashPrompts(args.systemPrompt, args.userPrompt);
  const started = Date.now();
  try {
    const data = await executeAI<T>({
      context: { feature: 'IELTS', useCase: args.context.useCase, promptName: args.context.promptName, promptVersion: 'v1' },
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
      options: {
        temperature: args.temperature,
        maxTokens: args.overrides?.maxTokens ?? args.maxTokens,
        timeoutMs: args.overrides?.timeoutMs ?? args.timeoutMs,
        jsonMode: true,
      },
      schema: args.schema,
    });
    return {
      ok: true,
      data,
      provider: getLastAIProvider() ?? null,
      durationMs: Date.now() - started,
      promptVersion: args.promptVersion,
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
      promptVersion: args.promptVersion,
      promptHash,
    };
  }
}

// ============================================
// 1. Objective set generation (Reading / Listening)
// ============================================

const GENERATION_MAX_TOKENS = 8192;
const GENERATION_TIMEOUT_MS = 180_000;

export interface IeltsQuestionGenerationAiRequest
  extends Omit<BuildIeltsGenerationUserPromptInput, 'skill' | 'testType'> {
  skill: IeltsGenSkill;
  testType: IeltsGenTestType;
  /** Optional overrides (tests / future tuning). */
  maxTokens?: number;
  timeoutMs?: number;
}

export function generateIeltsQuestionSetWithAI(
  input: IeltsQuestionGenerationAiRequest,
): Promise<IeltsGenerationAiResult<IeltsGeneratedSet>> {
  const systemPrompt = buildIeltsQuestionGenerationSystemPrompt(input.skill, input.testType);
  const userPrompt = buildIeltsQuestionGenerationUserPrompt({
    skill: input.skill,
    testType: input.testType,
    sectionLabel: input.sectionLabel,
    itemCount: input.itemCount,
    itemTypes: input.itemTypes,
    difficulty: input.difficulty,
    topicHint: input.topicHint,
    avoidPrompts: input.avoidPrompts,
    avoidTexts: input.avoidTexts,
    rejectionNotes: input.rejectionNotes,
  });
  return runGenerationCall({
    context: { useCase: 'IeltsQuestionGeneration', promptName: 'IeltsQuestionGeneration' },
    systemPrompt,
    userPrompt,
    schema: IeltsGeneratedSetSchema,
    temperature: 0.7,
    maxTokens: GENERATION_MAX_TOKENS,
    timeoutMs: GENERATION_TIMEOUT_MS,
    promptVersion: IELTS_QUESTION_GENERATION_V1,
    overrides: { maxTokens: input.maxTokens, timeoutMs: input.timeoutMs },
  });
}

// ============================================
// 1b. Section extension (top-up against an existing passage/transcript)
// ============================================
// Returns questions ONLY: the caller owns the section text and screens the new
// items against it. Same gates as set generation — this call is never trusted.

export interface IeltsSectionExtensionAiRequest
  extends Omit<BuildIeltsSectionExtensionUserPromptInput, 'skill' | 'testType'> {
  skill: IeltsGenSkill;
  testType: IeltsGenTestType;
  /** Optional overrides (tests / future tuning). */
  maxTokens?: number;
  timeoutMs?: number;
}

export function extendIeltsSectionWithAI(
  input: IeltsSectionExtensionAiRequest,
): Promise<IeltsGenerationAiResult<IeltsGeneratedItems>> {
  const systemPrompt = buildIeltsSectionExtensionSystemPrompt(input.skill, input.testType);
  const userPrompt = buildIeltsSectionExtensionUserPrompt({
    skill: input.skill,
    testType: input.testType,
    sectionLabel: input.sectionLabel,
    itemCount: input.itemCount,
    sectionText: input.sectionText,
    itemTypes: input.itemTypes,
    difficulty: input.difficulty,
    avoidPrompts: input.avoidPrompts,
    rejectionNotes: input.rejectionNotes,
  });
  return runGenerationCall({
    context: { useCase: 'IeltsSectionExtension', promptName: 'IeltsQuestionGeneration' },
    systemPrompt,
    userPrompt,
    schema: IeltsGeneratedItemsSchema,
    temperature: 0.6,
    maxTokens: GENERATION_MAX_TOKENS,
    timeoutMs: GENERATION_TIMEOUT_MS,
    promptVersion: IELTS_SECTION_EXTENSION_V1,
    overrides: { maxTokens: input.maxTokens, timeoutMs: input.timeoutMs },
  });
}

// ============================================
// 2. Blind-solve verification (answer keys never sent)
// ============================================

const VERIFICATION_MAX_TOKENS = 4096;
const VERIFICATION_TIMEOUT_MS = 120_000;

export interface IeltsItemVerificationAiRequest
  extends Omit<BuildIeltsItemVerificationUserPromptInput, never> {
  skill: IeltsGenSkill;
  maxTokens?: number;
  timeoutMs?: number;
}

export function verifyIeltsItemsWithAI(
  input: IeltsItemVerificationAiRequest,
): Promise<IeltsGenerationAiResult<IeltsItemVerificationResponse>> {
  const systemPrompt = buildIeltsItemVerificationSystemPrompt(input.skill);
  const userPrompt = buildIeltsItemVerificationUserPrompt({
    passage: input.passage,
    transcript: input.transcript,
    items: input.items,
  });
  return runGenerationCall({
    context: { useCase: 'IeltsItemVerification', promptName: 'IeltsItemVerification' },
    systemPrompt,
    userPrompt,
    schema: IeltsItemVerificationSchema,
    temperature: 0.1,
    maxTokens: VERIFICATION_MAX_TOKENS,
    timeoutMs: VERIFICATION_TIMEOUT_MS,
    promptVersion: IELTS_ITEM_VERIFICATION_V1,
    overrides: { maxTokens: input.maxTokens, timeoutMs: input.timeoutMs },
  });
}

// ============================================
// 3. Writing task-prompt generation
// ============================================

export interface IeltsWritingPromptGenerationAiRequest {
  testType: IeltsGenTestType;
  taskType: IeltsWritingTaskTypeName;
  topicHint?: string;
  avoidPrompts: string[];
  rejectionNotes?: string[];
  maxTokens?: number;
  timeoutMs?: number;
}

export function generateIeltsWritingPromptWithAI(
  input: IeltsWritingPromptGenerationAiRequest,
): Promise<IeltsGenerationAiResult<IeltsWritingPromptGeneration>> {
  const systemPrompt = buildIeltsWritingGenerationSystemPrompt(input.testType, input.taskType);
  const userPrompt = buildIeltsWritingGenerationUserPrompt({
    testType: input.testType,
    taskType: input.taskType,
    topicHint: input.topicHint,
    avoidPrompts: input.avoidPrompts,
    rejectionNotes: input.rejectionNotes,
  });
  return runGenerationCall({
    context: { useCase: 'IeltsQuestionGeneration', promptName: 'IeltsQuestionGeneration' },
    systemPrompt,
    userPrompt,
    schema: IeltsWritingPromptGenerationSchema,
    temperature: 0.6,
    maxTokens: 2048,
    timeoutMs: 90_000,
    promptVersion: IELTS_WRITING_PROMPT_GENERATION_V1,
    overrides: { maxTokens: input.maxTokens, timeoutMs: input.timeoutMs },
  });
}

// ============================================
// 4. Writing task-prompt conformance check
// ============================================

export interface IeltsWritingPromptVerificationAiRequest {
  testType: IeltsGenTestType;
  taskType: IeltsWritingTaskTypeName;
  promptText: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export function verifyIeltsWritingPromptWithAI(
  input: IeltsWritingPromptVerificationAiRequest,
): Promise<IeltsGenerationAiResult<IeltsWritingPromptVerification>> {
  const systemPrompt = buildIeltsWritingVerificationSystemPrompt();
  const userPrompt = buildIeltsWritingVerificationUserPrompt({
    testType: input.testType,
    taskType: input.taskType,
    promptText: input.promptText,
  });
  return runGenerationCall({
    context: { useCase: 'IeltsQuestionGeneration', promptName: 'IeltsQuestionGeneration' },
    systemPrompt,
    userPrompt,
    schema: IeltsWritingPromptVerificationSchema,
    temperature: 0.1,
    maxTokens: 1024,
    timeoutMs: 90_000,
    promptVersion: IELTS_WRITING_PROMPT_VERIFICATION_V1,
    overrides: { maxTokens: input.maxTokens, timeoutMs: input.timeoutMs },
  });
}
