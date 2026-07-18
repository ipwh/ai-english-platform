// ============================================
// AI Provider Registry — dependency injection & fallback chain
// Sprint 3: AI Provider Abstraction
// ============================================

import type { AIProvider } from './provider-interface';
import { isProviderAvailable } from './provider-interface';
import type { ChatMessage, LLMCallOptions, ProviderCallResult } from './types';
import { deepseekProvider } from './deepseek-provider';
import { vertexGeminiProvider } from './vertex-gemini-provider';
import { geminiProvider } from './gemini-provider';
import { claudeProvider } from './claude-provider';
import { openaiProvider } from './openai-provider';
import { logger } from '@/shared/logger/logger';
import { aiCache } from '@/modules/ai/services/ai-cache';

// ============================================
// Provider registry with priority-ordered fallback
// ============================================

class ProviderRegistry {
  private providers: AIProvider[] = [];
  private lastUsed: string = 'none';

  constructor() {
    // Priority order: DeepSeek → Vertex Gemini → Gemini API → Claude → OpenAI
    this.register(deepseekProvider);
    this.register(vertexGeminiProvider);
    this.register(geminiProvider);
    this.register(claudeProvider);
    this.register(openaiProvider);
  }

  register(provider: AIProvider): void {
    this.providers.push(provider);
  }

  getAvailableProviders(): AIProvider[] {
    return this.providers.filter(p => isProviderAvailable(p));
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
      throw new Error('No AI provider configured. Set DEEPSEEK_API_KEY or GEMINI_API_KEY.');
    }

    // Cache for deterministic requests
    const cacheKey = JSON.stringify({ messages, temperature: options?.temperature, jsonMode: options?.jsonMode });
    if (!options?.temperature || options.temperature <= 0.3) {
      const cached = await aiCache.get(cacheKey);
      if (cached) return { text: cached, provider: 'cache', latencyMs: 0, fallback: false };
    }

    const errors: string[] = [];
    const startTime = Date.now();

    for (let i = 0; i < available.length; i++) {
      const provider = available[i];
      try {
        const text = await provider.call(messages, options);
        this.lastUsed = provider.name;
        const latencyMs = Date.now() - startTime;
        const fallback = i > 0;

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
        if (i < available.length - 1) {
          logger.warn({ module: 'ai-provider', provider: provider.name, error: msg }, `Falling back to next provider`);
        }
      }
    }

    logger.error({ module: 'ai-provider', errors }, 'All AI providers failed');
    throw new Error(`All AI providers failed:\n${errors.join('\n')}`);
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
export { deepseekProvider, vertexGeminiProvider, geminiProvider, claudeProvider, openaiProvider };
