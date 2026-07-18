// ============================================
// DeepSeekProvider — DeepSeek API (primary provider)
// Sprint 3: AI Provider Abstraction
// ============================================

import type { AIProvider } from './provider-interface';
import type { ChatMessage, LLMCallOptions } from './types';
import { config } from '@/shared/config/config';
import { logger } from '@/shared/logger/logger';

export class DeepSeekProvider implements AIProvider {
  readonly name = 'deepseek';

  isConfigured(): boolean {
    return config.deepseek.isConfigured;
  }

  async call(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
    const apiKey = config.deepseek.apiKey;
    if (!apiKey) throw new Error('DeepSeek API key not configured.');

    const timeoutMs = options?.timeoutMs || config.ai.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.deepseek.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1024,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
          ...(options?.userId ? { user_id: options.userId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        // 402 = insufficient balance — should trigger fallback, not timeout
        throw new Error(`DeepSeek error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content || '';
    } catch (err: unknown) {
      // Node.js AbortError is NOT a DOMException — check name instead
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('DeepSeek request timed out.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async generateExercise(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string> {
    return this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { ...options, jsonMode: true, maxTokens: 4096 });
  }

  async gradeEssay(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string> {
    return this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { ...options, jsonMode: true, maxTokens: 2048 });
  }

  async generateFeedback(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string> {
    return this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { ...options, jsonMode: true, maxTokens: 2048 });
  }

  async chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
    return this.call(messages, { ...options, maxTokens: 2048 });
  }

  async diagnose(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string> {
    return this.call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { ...options, jsonMode: true, maxTokens: 2048 });
  }
}

export const deepseekProvider = new DeepSeekProvider();
