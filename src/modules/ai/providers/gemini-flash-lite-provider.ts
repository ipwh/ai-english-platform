// ============================================
// GeminiFlashLiteProvider — fastest/cheapest Gemini fallback
// Uses gemini-2.5-flash-lite: $0.10/M input, $0.40/M output
// ============================================

import type { AIProvider } from './provider-interface';
import type { ChatMessage, LLMCallOptions } from './types';
import { config } from '@/shared/config/config';

const GEMINI_JSON_INSTRUCTION = '\n⚠️ IMPORTANT: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no extra text. Start with { or [.';

export class GeminiFlashLiteProvider implements AIProvider {
  readonly name = 'gemini-flash-lite';

  isConfigured(): boolean {
    return config.geminiLite.isConfigured;
  }

  async call(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
    const apiKey = config.geminiLite.apiKey;
    if (!apiKey) throw new Error('Gemini Flash-Lite API key not configured.');

    const timeoutMs = options?.timeoutMs || config.ai.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const adaptedMessages = options?.jsonMode
      ? messages.map(m => m.role === 'system' ? { ...m, content: m.content + GEMINI_JSON_INSTRUCTION } : m)
      : messages;

    const systemMessages = adaptedMessages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = adaptedMessages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const isJson = options?.jsonMode ?? false;

    try {
      const isGcpKey = apiKey.startsWith('AQ.');
      const url = isGcpKey
        ? `${config.geminiLite.baseUrl}/models/${config.geminiLite.model}:generateContent`
        : `${config.geminiLite.baseUrl}/models/${config.geminiLite.model}:generateContent?key=${apiKey}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isGcpKey) headers['x-goog-api-key'] = apiKey;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          systemInstruction: systemMessages ? { role: 'system', parts: [{ text: systemMessages }] } : undefined,
          contents,
          generationConfig: {
            temperature: isJson ? (options?.temperature ?? 0.3) : (options?.temperature ?? 0.7),
            maxOutputTokens: isJson ? Math.max(options?.maxTokens ?? 1024, 4096) : (options?.maxTokens ?? 1024),
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini Flash-Lite error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
      const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
      if (!content) throw new Error(data.error?.message || 'Gemini Flash-Lite returned empty response.');
      return content;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Gemini Flash-Lite request timed out.');
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

export const geminiFlashLiteProvider = new GeminiFlashLiteProvider();
