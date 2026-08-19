// v4.1: AIFacade — Unified entry point for ALL AI-related logic
// Design Rule #8: All AI providers remain completely independent from learning logic.
// Learning modules never know whether DeepSeek, Gemini or OpenAI generated the response.

// ============================================
// Providers (5-model fallback chain)
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
 *   Providers  — 5-model fallback: DeepSeek → Vertex Gemini → Gemini → Claude → OpenAI
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
