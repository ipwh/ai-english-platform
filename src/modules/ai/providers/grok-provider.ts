// ============================================
// GrokProvider — xAI Grok (OpenAI-compatible API)
// Uses grok-4.3: $1.25/M input, $2.50/M output
// ============================================

import type { AIProvider } from './provider-interface';
import type { ChatMessage, LLMCallOptions } from './types';
import { config } from '@/shared/config/config';
import { logger } from '@/shared/logger/logger';

export class GrokProvider implements AIProvider {
  readonly name = 'grok';

  isConfigured(): boolean {
    return config.grok.isConfigured;
  }

  async call(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
    const apiKey = config.grok.apiKey;
    if (!apiKey) throw new Error('Grok API key not configured.');

    const timeoutMs = options?.timeoutMs || config.ai.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    logger.info({ module: 'grok', model: config.grok.model, timeoutMs }, 'Grok API call');

    try {
      const res = await fetch(`${config.grok.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.grok.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1024,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Grok error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content || '';
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Grok request timed out.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async generateExercise(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string> {
    return this.call([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], { ...options, jsonMode: true, maxTokens: 4096 });
  }
  async gradeEssay(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string> {
    return this.call([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], { ...options, jsonMode: true, maxTokens: 2048 });
  }
  async generateFeedback(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string> {
    return this.call([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], { ...options, jsonMode: true, maxTokens: 2048 });
  }
}

export const grokProvider = new GrokProvider();
