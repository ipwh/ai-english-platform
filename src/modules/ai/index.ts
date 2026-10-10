// v4.1: AIFacade — Unified entry point for ALL AI-related logic
// Design Rule #8: All AI providers remain completely independent from learning logic.
// Learning modules never know whether DeepSeek, Gemini or OpenAI generated the response.

// ============================================
// Providers (6 registered: DeepSeek → Gemini Flash → Gemini Flash-Lite → Grok → Claude → OpenAI;
// runtime active chain after Gemini key retirement 2026-08-20 = DeepSeek → Grok; Claude/OpenAI are placeholders)
// ============================================
import { providerRegistry } from '@/modules/ai/providers/provider-registry';
export { providerRegistry };
export type { AIProvider } from '@/modules/ai/providers/provider-interface';

// Core AI service — question generation, writing analysis, TTS
import {
  generateQuestions,
  type GeneratedQuestion,
  type GenerateQuestionsInput,
  callLLM,
  sanitizeForAI,
  isDeepSeekConfigured,
  isAIConfigured,
  getAIProviders,
  getLastAIProvider,
  wasFallbackUsed,
  getRetryStats,
  analyzeAnswer,
  type AnalyzeAnswerInput,
  type AnswerAnalysis,
  analyzeWriting,
  type AnalyzeWritingInput,
  type WritingAnalysis,
  explainMistake,
  type ExplainMistakeInput,
  type MistakeExplanation,
  analyzeWord,
  analyzeProgress,
  answerStudyHelp,
  type StudyHelpInput,
  type StudyHelpResponse,
  analyzeMaterial,
  generateWritingPrompt,
  generateWritingOutline,
  generateWritingGuide,
  generateIntegratedSkills,
  type GenerateIntegratedSkillsInput,
  analyzeIntegratedSkills,
  selectDiverseTopic,
  buildDiversityInstruction,
} from '@/modules/ai/services/ai-service';
export {
  generateQuestions,
  type GeneratedQuestion,
  type GenerateQuestionsInput,
  callLLM,
  sanitizeForAI,
  isDeepSeekConfigured,
  isAIConfigured,
  getAIProviders,
  getLastAIProvider,
  wasFallbackUsed,
  getRetryStats,
  analyzeAnswer,
  type AnalyzeAnswerInput,
  type AnswerAnalysis,
  analyzeWriting,
  type AnalyzeWritingInput,
  type WritingAnalysis,
  explainMistake,
  type ExplainMistakeInput,
  type MistakeExplanation,
  analyzeWord,
  analyzeProgress,
  answerStudyHelp,
  type StudyHelpInput,
  type StudyHelpResponse,
  analyzeMaterial,
  generateWritingPrompt,
  generateWritingOutline,
  generateWritingGuide,
  generateIntegratedSkills,
  type GenerateIntegratedSkillsInput,
  analyzeIntegratedSkills,
  selectDiverseTopic,
  buildDiversityInstruction,
};

// RAG — DSE past paper retrieval
import * as ragService from '@/modules/ai/services/rag-service';
export { ragService };

// TTS
import * as ttsService from '@/modules/ai/services/tts-service';
export { ttsService };

// Hallucination guard
export { HALLUCINATION_GUARD, HALLUCINATION_GUARD_LITE } from '@/modules/ai/services/hallucination-guard';

// Answer verification — pre-delivery gate for generated answer keys
// (2026-09-20: generated items with four wrong options must never be delivered)
import {
  verifyGeneratedAnswers,
  inspectGeneratedQuestion,
  summarizeVerificationDrops,
} from '@/modules/ai/services/answer-verification';
export {
  verifyGeneratedAnswers,
  inspectGeneratedQuestion,
  summarizeVerificationDrops,
};
export type {
  AnswerVerificationDrop,
  AnswerVerificationOptions,
  AnswerVerifier,
  GeneratedAnswerVerificationResult,
} from '@/modules/ai/services/answer-verification';

// ============================================
// IELTS Assessment (2026-10-03 PHASE IELTS-01) — AI estimates only
// ============================================
// Criterion-specific writing assessment through the canonical pipeline.
// Speaking is preparation-only (2026-10-03 II): the platform does NOT score
// Speaking and does NOT simulate an examiner.
// See docs/ielts/IELTS_ASSESSMENT_GOVERNANCE.md.
import { assessIeltsWritingWithAI } from '@/modules/ai/usecases/ielts-writing-assessment';
import { prepareIeltsSpeakingWithAI } from '@/modules/ai/usecases/ielts-speaking-prep';
import { IELTS_SPEAKING_PREP_PROMPT_VERSION } from '@/modules/ai/prompts/ielts/speaking-preparation';
import {
  IELTS_WRITING_TASK1_PROMPT_VERSION,
  IELTS_WRITING_TASK2_PROMPT_VERSION,
  writingPromptVersionFor,
} from '@/modules/ai/prompts/ielts/writing-assessment';
export {
  assessIeltsWritingWithAI,
  prepareIeltsSpeakingWithAI,
  IELTS_WRITING_TASK1_PROMPT_VERSION,
  IELTS_WRITING_TASK2_PROMPT_VERSION,
  writingPromptVersionFor,
  IELTS_SPEAKING_PREP_PROMPT_VERSION,
};
export type {
  IeltsWritingAiRequest,
  IeltsWritingAiResult,
  IeltsWritingAiFailure,
} from '@/modules/ai/usecases/ielts-writing-assessment';
export type {
  IeltsSpeakingPrepAiRequest,
  IeltsSpeakingPrepAiResult,
  IeltsSpeakingPrepAiFailure,
} from '@/modules/ai/usecases/ielts-speaking-prep';
export type {
  IeltsWritingAssessmentResponse,
  IeltsSpeakingPrepResponse,
} from '@/modules/ai/schemas/ielts-assessment-schema';

// ============================================
// IELTS Question Generation (2026-10-03 PHASE IELTS-01 IV) — DRAFT → QA only
// ============================================
// AI-authored practice content for the isolated IELTS subsystem. The AI output
// is RAW: the IELTS module machine-screens it and blind-solve-verifies every
// answer before anything is stored. Generated content can only reach
// QA_REQUIRED — a human must approve and publish. See IELTS_SPECIFICATION.md §5.
import {
  generateIeltsQuestionSetWithAI,
  extendIeltsSectionWithAI,
  verifyIeltsItemsWithAI,
  generateIeltsWritingPromptWithAI,
  verifyIeltsWritingPromptWithAI,
} from '@/modules/ai/usecases/ielts-question-generation';
import {
  IELTS_QUESTION_GENERATION_V1,
  IELTS_SECTION_EXTENSION_V1,
  IELTS_ITEM_VERIFICATION_V1,
  IELTS_WRITING_PROMPT_GENERATION_V1,
  IELTS_WRITING_PROMPT_VERIFICATION_V1,
} from '@/modules/ai/prompts/ielts/question-generation';
export {
  generateIeltsQuestionSetWithAI,
  extendIeltsSectionWithAI,
  verifyIeltsItemsWithAI,
  generateIeltsWritingPromptWithAI,
  verifyIeltsWritingPromptWithAI,
  IELTS_QUESTION_GENERATION_V1,
  IELTS_SECTION_EXTENSION_V1,
  IELTS_ITEM_VERIFICATION_V1,
  IELTS_WRITING_PROMPT_GENERATION_V1,
  IELTS_WRITING_PROMPT_VERIFICATION_V1,
};
export type {
  IeltsQuestionGenerationAiRequest,
  IeltsSectionExtensionAiRequest,
  IeltsItemVerificationAiRequest,
  IeltsWritingPromptGenerationAiRequest,
  IeltsWritingPromptVerificationAiRequest,
  IeltsGenerationAiResult,
  IeltsGenerationAiFailure,
} from '@/modules/ai/usecases/ielts-question-generation';
export type {
  IeltsGeneratedSet,
  IeltsGeneratedQuestion,
  IeltsGeneratedItems,
  IeltsItemVerificationResponse,
  IeltsWritingPromptGeneration,
  IeltsWritingPromptVerification,
} from '@/modules/ai/schemas/ielts-generation-schema';

// ============================================
// IELTS Mistake Explanation (2026-10-03 VI) — advisory only
// ============================================
// Explains a WRONG objective answer the student gave. Never changes the mark
// (scoring is deterministic and server-side); forbidden-claim screened.
import { explainIeltsMistakeWithAI } from '@/modules/ai/usecases/ielts-mistake-explanation';
import { IELTS_MISTAKE_EXPLANATION_V1 } from '@/modules/ai/prompts/ielts/mistake-explanation';
export { explainIeltsMistakeWithAI, IELTS_MISTAKE_EXPLANATION_V1 };
export type {
  IeltsMistakeExplanationAiRequest,
  IeltsMistakeExplanationAiResult,
  IeltsMistakeExplanationAiFailure,
} from '@/modules/ai/usecases/ielts-mistake-explanation';
export type { IeltsMistakeExplanationResponse } from '@/modules/ai/schemas/ielts-assessment-schema';

// Runtime budget policy — typed exhaustion error for 503 mapping in routes
export { BudgetExceededError, isBudgetExceededError } from '@/modules/ai/runtime/budget-policy';

// Self-Directed Practice (2026-10-10, Sprint 140) — student-authored practice requests.
export { generateCustomPracticeWithAI, gradeCustomPracticeWithAI } from '@/modules/ai/usecases/custom-practice';
export type {
  CustomPracticeGenerationResult,
  CustomPracticeGradingResult,
} from '@/modules/ai/usecases/custom-practice';
export {
  CUSTOM_PRACTICE_CATEGORIES,
  CUSTOM_PRACTICE_DIFFICULTIES,
  CUSTOM_PRACTICE_QUESTION_TYPES,
  CustomPracticeGenerationSchema,
  CustomPracticeGradingSchema,
} from '@/modules/ai/schemas/custom-practice-schema';
export type {
  CustomPracticeCategory,
  CustomPracticeDifficulty,
  CustomPracticeGeneratedQuestion,
  CustomPracticeGradingResponse,
  CustomPracticeQuestionType,
} from '@/modules/ai/schemas/custom-practice-schema';
export {
  CUSTOM_PRACTICE_GENERATION_V1,
  CUSTOM_PRACTICE_GRADING_V1,
} from '@/modules/ai/prompts/custom-practice/prompts';

// AI Evaluator (reading answer evaluation)
export { evaluateWithAI, type AIEvaluationResult } from '@/modules/ai/services/ai-evaluator';

// Integrated Skills types — canonical definitions (usecases/integrated-skills-types.ts)
export type {
  IntegratedSkillsTask,
  AnalyzeIntegratedSkillsInput,
  IntegratedSkillsAnalysis,
} from '@/modules/ai/usecases/integrated-skills-types';
export {
  INTEGRATED_SKILLS_DIFF_MAP,
  INTEGRATED_SKILLS_TASK_TYPE_MAP,
} from '@/modules/ai/services/integrated-skills-config';
export type { DifficultyConfig, TaskTypeConfig } from '@/modules/ai/services/integrated-skills-config';

// Schemas
import {
  GeneratedQuestionsArraySchema,
  validateAIResponse,
} from '@/modules/ai/schemas/ai-schema';
export {
  GeneratedQuestionsArraySchema,
  validateAIResponse,
};

// ============================================
// Cache (S12) — TTL in-memory cache
// ============================================
import { cacheService } from '@/modules/cache/cache-service';
export { cacheService };

// ============================================
// Cost (S13) — token estimation, cost tracking
// ============================================
import * as costTracker from '@/modules/ai-cost/cost-tracker';
export { costTracker };

// ============================================
// Evaluation — LLM eval, prompt testing, model comparison
// ============================================
import * as evalEngine from '@/modules/llm-eval/services/eval-engine';
export { evalEngine };

// ============================================
// Experiment (S42) — A/B testing for prompts and models
// ============================================
import { experimentService as experimentEngine } from '@/modules/experiment/services/experiment-engine';
export { experimentEngine };

// ============================================
// Prompt Registry — centralized prompt discovery & versioning
// ============================================
import {
  registerPrompt,
  getPrompt,
  listPrompts,
} from '@/modules/ai/prompts/prompt-registry';
export type { PromptDefinition } from '@/modules/ai/prompts/prompt-registry';
export {
  registerPrompt,
  getPrompt,
  listPrompts,
};

// ============================================
// Student Enrichment — shared prompt enrichment from StudentProfile
// ============================================
export { buildStudentContextSection } from '@/modules/ai/services/student-enrichment';

// ============================================
// Unified Facade Object
// ============================================

/**
 * AIFacade — v4.1
 *
 * ALL AI-related logic must be accessed through this facade.
 * ProviderRegistry is the single entry point for model selection.
 *
 * Sub-domains:
 *   Providers  — 6 registered: DeepSeek → Gemini Flash → Gemini Flash-Lite →
 *                Grok → Claude → OpenAI (Claude/OpenAI are hard-disabled
 *                placeholders; Gemini keys retired 2026-08-20 → effective
 *                runtime fallback is DeepSeek → Grok)
 *   Prompts    — structured prompt templates (internal to ai/)
 *   Cache      — TTL in-memory cache (S12)
 *   Cost       — token estimation and cost tracking (S13)
 *   Evaluation — LLM eval, prompt testing, model comparison
 *   Experiment — A/B testing for prompts and models (S42)
 *   RAG        — DSE past paper retrieval
 *
 * Design Rule #8 compliance:
 *   Learning modules import AIFacade, never individual providers.
 *   Provider selection is transparent to callers.
 *
 * @example
 * import { AIFacade } from '@/modules/ai';
 * const questions = await AIFacade.generateQuestions({ topic: 'tenses', count: 5 });
 */
export const AIFacade = {
  providers: {
    registry: providerRegistry,
    getLastUsed: getLastAIProvider,
    wasFallbackUsed,
    isDeepSeekConfigured,
  },

  generation: {
    questions: generateQuestions,
    writingPrompt: generateWritingPrompt,
    verifyAnswers: verifyGeneratedAnswers,
  },

  analysis: {
    writing: analyzeWriting,
  },

  rag: {
    service: ragService,
  },

  tts: {
    service: ttsService,
  },

  cache: {
    service: cacheService,
  },

  cost: {
    tracker: costTracker,
  },

  evaluation: {
    engine: evalEngine,
  },

  experiment: {
    engine: experimentEngine,
  },

  utils: {
    callLLM,
    sanitize: sanitizeForAI,
    getRetryStats,
  },
} as const;
