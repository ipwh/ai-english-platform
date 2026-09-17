// ============================================
// AI Provider Registry — dependency injection & fallback chain
// Sprint 3: AI Provider Abstraction
// ============================================

import type { AIProvider } from './provider-interface';
import { isProviderAvailable } from './provider-interface';
import type { ChatMessage, LLMCallOptions, ProviderCallResult } from './types';
import { deepseekProvider } from './deepseek-provider';
import { geminiProvider } from './gemini-provider';
import { geminiFlashLiteProvider } from './gemini-flash-lite-provider';
import { grokProvider } from './grok-provider';
import { claudeProvider } from './claude-provider';
import { openaiProvider } from './openai-provider';
import { logger } from '@/shared/logger/logger';
import { aiCache } from '@/modules/ai/services/ai-cache';
import { isProviderAvailable as isCircuitOk, recordSuccess as cbRecordSuccess, recordFailure as cbRecordFailure } from '@/modules/ai/runtime/circuit-breaker';
import {
  getBudgetStatus,
  recordTokenUsage,
  BudgetExceededError,
  ESTIMATED_USD_PER_TOKEN,
} from '@/modules/ai/runtime/budget-policy';

// ============================================
// Provider registry with priority-ordered fallback
// ============================================

class ProviderRegistry {
  private providers: AIProvider[] = [];
  private lastUsed: string = 'none';

  constructor() {
    // Priority: DeepSeek → Gemini Flash → Gemini Flash-Lite → Grok → Claude → OpenAI
    this.register(deepseekProvider);
    this.register(geminiProvider);
    this.register(geminiFlashLiteProvider);
    this.register(grokProvider);
    this.register(claudeProvider);
    this.register(openaiProvider);
  }

  register(provider: AIProvider): void {
    this.providers.push(provider);
  }

  getAvailableProviders(): AIProvider[] {
    return this.providers.filter(p => isProviderAvailable(p) && isCircuitOk(p.name));
  }

  getProvider(name: string): AIProvider | undefined {
    return this.providers.find(p => p.name === name);
  }

  getLastUsed(): string { return this.lastUsed; }

  /**
   * Call the best available provider with automatic fallback.
   * Uses AI cache for deterministic (low-temperature) requests.
   */
  async call(messages: ChatMessage[], options?: LLMCallOptions): Promise<ProviderCallResult> {
    const available = this.getAvailableProviders();
    if (available.length === 0) {
      // Gemini API retired 2026-08-20; effective runtime chain is DeepSeek → Grok
      throw new Error('No AI provider configured. Set DEEPSEEK_API_KEY.');
    }

    // Cache for deterministic requests (served BEFORE the budget gate — a
    // cache hit costs nothing and must not be blocked by budget exhaustion).
    const cacheKey = JSON.stringify({
      messages,
      temperature: options?.temperature,
      jsonMode: options?.jsonMode,
      // Thinking settings change the answer, so they must participate in the cache key
      // (undefined values are omitted by JSON.stringify → existing keys unchanged).
      thinking: options?.thinking,
      reasoningEffort: options?.reasoningEffort,
    });
    if (!options?.temperature || options.temperature <= 0.3) {
      const cached = await aiCache.get(cacheKey);
      if (cached) return { text: cached, provider: 'cache', latencyMs: 0, fallback: false };
    }

    // Enforce budget only when a real paid provider call is about to happen.
    // The ledger is shared across instances (AiDailyUsage), so an instance that
    // just booted cannot spend a second full daily quota.
    const budget = await getBudgetStatus();
    if (budget.exceeded) {
      throw new BudgetExceededError(budget.tokensRemaining <= 0 ? 'token' : 'cost');
    }

    const errors: string[] = [];
    const startTime = Date.now();

    // Cloud Run allows a 300s request (cloud-run.yaml), but this budget is kept
    // conservatively low so a single fallback chain never approaches the platform limit.
    const TOTAL_BUDGET_MS = 115_000;
    for (let i = 0; i < available.length; i++) {
      const provider = available[i];
      const isFallback = i > 0;
      let adjustedOptions = options;
      if (isFallback && options?.timeoutMs) {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, TOTAL_BUDGET_MS - elapsed);
        // Each fallback gets 50% of original timeout, min 20s (was 15s — too short for 3000+ token JSON)
        // Grok empirical: 2700 tokens in ~14s, but 1500 tokens truncated at 15s under load
        const fallbackTimeout = Math.min(remaining, Math.max(20_000, Math.floor(options.timeoutMs / 2)));
        adjustedOptions = { ...options, timeoutMs: fallbackTimeout };
      }
      try {
        const text = await provider.call(messages, adjustedOptions);
        this.lastUsed = provider.name;
        const latencyMs = Date.now() - startTime;
        const fallback = i > 0;

        // Record success with circuit breaker
        cbRecordSuccess(provider.name);

        // Track token usage (estimated: 1 token ≈ 4 chars) + rough cost
        // estimate so the monthly cost budget actually participates.
        // Accounting must never fail a call that already succeeded.
        const estimatedInputTokens = Math.ceil(
          messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / 4
        );
        const estimatedOutputTokens = Math.ceil(text.length / 4);
        const estimatedTokens = estimatedInputTokens + estimatedOutputTokens;
        try {
          await recordTokenUsage(estimatedTokens, estimatedTokens * ESTIMATED_USD_PER_TOKEN);
        } catch (err) {
          logger.error({
            module: 'ai-provider',
            provider: provider.name,
            error: err instanceof Error ? err.message : String(err),
          }, 'Failed to record AI token usage — the daily budget will under-count this call');
        }

        logger.info({
          module: 'ai-provider', event: 'call_success', provider: provider.name, latencyMs, fallback,
        }, `AI call succeeded via ${provider.name}`);

        if (!options?.temperature || options.temperature <= 0.3) {
          await aiCache.set(cacheKey, text);
        }
        return { text, provider: provider.name, latencyMs, fallback };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${provider.name}: ${msg}`);
        // Record failure with circuit breaker
        cbRecordFailure(provider.name);
        if (i < available.length - 1) {
          logger.warn({ module: 'ai-provider', provider: provider.name, error: msg }, `Falling back to next provider`);
        }
      }
    }

    logger.error({ module: 'ai-provider', errors }, 'All AI providers failed');
    const configuredList = available.map(p => p.name).join(', ');
    throw new Error(`All AI providers failed (configured: ${configuredList}):\n${errors.join('\n')}`);
  }

  /** Convenience: generate exercises */
  async generateExercise(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<ProviderCallResult> {
    return this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { ...options, jsonMode: true, maxTokens: 4096 });
  }

  /** Convenience: grade essay */
  async gradeEssay(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<ProviderCallResult> {
    return this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { ...options, jsonMode: true, maxTokens: 2048 });
  }

  /** Convenience: generate feedback */
  async generateFeedback(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<ProviderCallResult> {
    return this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { ...options, jsonMode: true, maxTokens: 2048 });
  }

  /** Convenience: chat */
  async chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<ProviderCallResult> {
    return this.call(messages, { ...options, maxTokens: 2048 });
  }

  /** Convenience: diagnose */
  async diagnose(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<ProviderCallResult> {
    return this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { ...options, jsonMode: true, maxTokens: 2048 });
  }
}

// Singleton
export const providerRegistry = new ProviderRegistry();

// Re-export individual providers for direct access
export { deepseekProvider, geminiProvider, geminiFlashLiteProvider, grokProvider, claudeProvider, openaiProvider };
