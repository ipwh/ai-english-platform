// ============================================
// Self-Directed Practice — AI usecases (2026-10-10, Sprint 140)
// ============================================
// The ONLY place that talks to the model for this feature. Both usecases go
// through the canonical pipeline (`executeAI()` → callLLM → parse → Zod
// validate); no second pipeline and no provider access are introduced.
//
// Failure semantics: provider errors, timeouts, budget exhaustion and
// unparseable JSON all THROW (or surface as a schema error). Nothing here
// invents a fallback verdict — the caller decides, and for grading the only
// permitted fallback is "needs review", never "incorrect".
// ============================================

import { executeAI } from '../services/ai-execution';
import {
  CustomPracticeGenerationSchema,
  CustomPracticeGradingSchema,
  CustomPracticeVerificationSchema,
  type CustomPracticeGeneratedQuestion,
  type CustomPracticeGradingResponse,
  type CustomPracticeVerificationResponse,
} from '../schemas/custom-practice-schema';
import {
  CUSTOM_PRACTICE_GENERATION_V4,
  CUSTOM_PRACTICE_GRADING_V2,
  CUSTOM_PRACTICE_VERIFICATION_V1,
  buildCustomPracticeGenerationPrompt,
  buildCustomPracticeGradingPrompt,
  buildCustomPracticeVerificationPrompt,
  type CustomPracticeGenerationPromptInput,
  type CustomPracticeGradingPromptItem,
  type CustomPracticeVerificationPromptItem,
} from '../prompts/custom-practice/prompts';

export interface CustomPracticeGenerationResult {
  questions: CustomPracticeGeneratedQuestion[];
  promptVersion: string;
}

export async function generateCustomPracticeWithAI(
  input: CustomPracticeGenerationPromptInput
): Promise<CustomPracticeGenerationResult> {
  const { system, user } = buildCustomPracticeGenerationPrompt(input);

  const response = await executeAI({
    context: {
      feature: 'CustomPractice',
      useCase: 'GeneratePracticeSet',
      promptName: 'CustomPracticeGeneration',
    },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // Slightly creative (varied items) but JSON-mode so the schema can be enforced.
    // maxTokens must cover the LARGEST request the UI allows (10 questions), each with
    // two explanations (En + Zh), a rubric and accepted/rejected answer lists.
    // Measured 2026-10-10: 5 items ≈ 7.1k JSON characters, 10 items with all five
    // question types = 11.4k–12.4k characters. The previous 3200 budget truncated the
    // JSON, every repair strategy failed and 10 questions threw
    // "AI 回傳格式無法解析" — deterministically, on every retry (the same request with
    // maxTokens 8000 generated all 10 items). Verification and grading budgets are
    // unaffected: both returned all 10 items within their existing limits.
    options: { temperature: 0.4, maxTokens: 12000, jsonMode: true },
    schema: CustomPracticeGenerationSchema,
  });

  return { questions: response.questions, promptVersion: CUSTOM_PRACTICE_GENERATION_V4 };
}

export interface CustomPracticeGradingResult {
  results: CustomPracticeGradingResponse['results'];
  promptVersion: string;
}

export async function gradeCustomPracticeWithAI(input: {
  category: string;
  difficulty: string;
  items: readonly CustomPracticeGradingPromptItem[];
}): Promise<CustomPracticeGradingResult> {
  const { system, user } = buildCustomPracticeGradingPrompt(input);

  const response = await executeAI({
    context: {
      feature: 'CustomPractice',
      useCase: 'GradePracticeSubmission',
      promptName: 'CustomPracticeGrading',
    },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // Low temperature: marking must be as reproducible as the model allows.
    options: { temperature: 0.1, maxTokens: 2600, jsonMode: true },
    schema: CustomPracticeGradingSchema,
  });

  return { results: response.results, promptVersion: CUSTOM_PRACTICE_GRADING_V2 };
}

export interface CustomPracticeVerificationResult {
  results: CustomPracticeVerificationResponse['results'];
  promptVersion: string;
}

/**
 * Blind verification: the verifier derives its own answer and judges fitness
 * WITHOUT being shown the proposed key. Comparison against the key happens
 * afterwards, in the feature module, using deterministic rules (objective items)
 * or the grading usecase (open-ended items).
 */
export async function verifyCustomPracticeWithAI(input: {
  category: string;
  difficulty: string;
  items: readonly CustomPracticeVerificationPromptItem[];
}): Promise<CustomPracticeVerificationResult> {
  const { system, user } = buildCustomPracticeVerificationPrompt(input);

  const response = await executeAI({
    context: {
      feature: 'CustomPractice',
      useCase: 'VerifyPracticeQuestions',
      promptName: 'CustomPracticeVerification',
    },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    options: { temperature: 0.2, maxTokens: 2600, jsonMode: true },
    schema: CustomPracticeVerificationSchema,
  });

  return { results: response.results, promptVersion: CUSTOM_PRACTICE_VERIFICATION_V1 };
}
