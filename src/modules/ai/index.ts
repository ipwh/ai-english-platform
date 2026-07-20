// v4.1: AIFacade — Unified entry point for ALL AI-related logic
// Design Rule #8: All AI providers remain completely independent from learning logic.
// Learning modules never know whether DeepSeek, Gemini or OpenAI generated the response.

// ============================================
// Providers (5-model fallback chain)
// ============================================
export { providerRegistry } from '@/modules/ai/providers/provider-registry';
export type { ProviderName, AIProvider } from '@/modules/ai/providers/provider-interface';

// Core AI service — question generation, writing analysis, TTS
export {
  generateQuestions,
  callLLM,
  sanitizeForAI,
  isDeepSeekConfigured,
  getLastAIProvider,
  wasFallbackUsed,
  getRetryStats,
} from '@/modules/ai/services/ai-service';

// RAG — DSE past paper retrieval
export { ragService } from '@/modules/ai/services/rag-service';

// TTS
export { ttsService } from '@/modules/ai/services/tts-service';

// Writing
export { analyzeWriting } from '@/modules/ai/services/writing-analysis';
export { generateWritingPrompt } from '@/modules/ai/services/writing-generation';

// Schemas
export {
  GeneratedQuestionsArraySchema,
  validateAIResponse,
} from '@/modules/ai/schemas/ai-schema';

// ============================================
// Cache (S12) — TTL in-memory cache
// ============================================
export { cacheService } from '@/modules/cache/services/cache-service';

// ============================================
// Cost (S13) — token estimation, cost tracking
// ============================================
export { costTracker } from '@/modules/ai-cost/services/cost-tracker';

// ============================================
// Evaluation — LLM eval, prompt testing, model comparison
// ============================================
export { evalEngine } from '@/modules/llm-eval/services/eval-engine';

// ============================================
// Experiment (S42) — A/B testing for prompts and models
// ============================================
export { experimentEngine } from '@/modules/experiment/services/experiment-engine';

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
