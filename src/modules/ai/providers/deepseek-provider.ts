// ============================================
// DeepSeekProvider — DeepSeek API (primary provider, defaults to deepseek-chat)
// Sprint 3: AI Provider Abstraction
// Sprint 110: DEBUG mode — set DEEPSEEK_DEBUG=true for full request/response logs
// ============================================

import type { AIProvider } from './provider-interface';
import type { ChatMessage, LLMCallOptions } from './types';
import { config } from '@/shared/config/config';
import { logger } from '@/shared/logger/logger';

const DEBUG = process.env.DEEPSEEK_DEBUG === 'true';

function maskApiKey(key: string): string {
  if (!key || key.length < 12) return '***';
  return key.slice(0, 7) + '...' + key.slice(-4);
}

function debugLog(label: string, data: unknown): void {
  if (!DEBUG) return;
  const line = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  console.log(`\n[DEEPSEEK DEBUG] ========== ${label} ==========\n${line}\n`);
}

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

    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);

    const requestBody = {
      model: config.deepseek.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
      response_format: options?.jsonMode ? { type: 'json_object' as const } : undefined,
      ...(options?.userId ? { user_id: options.userId } : {}),
    };

    logger.info({
      module: 'deepseek',
      model: config.deepseek.model,
      baseUrl: config.deepseek.baseUrl,
      timeoutMs,
      totalChars,
      estimatedTokens: Math.ceil(totalChars / 4),
      jsonMode: options?.jsonMode,
    }, 'DeepSeek API call');

    const startTime = Date.now();

    // ── DEBUG: Full request log ──
    if (DEBUG) {
      debugLog('REQUEST', {
        method: 'POST',
        url: `${config.deepseek.baseUrl}/chat/completions`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${maskApiKey(apiKey)}`,
        },
        body: requestBody,
      });
    }

    try {
      const res = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const errText = await res.text();

        // ── DEBUG: Error response log ──
        debugLog(`ERROR RESPONSE (${res.status})`, {
          status: res.status,
          statusText: res.statusText,
          headers: Object.fromEntries(res.headers.entries()),
          body: errText.slice(0, 2000),
          latencyMs,
        });

        // 402 = insufficient balance — should trigger fallback, not timeout
        throw new Error(`DeepSeek error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json() as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
        id?: string;
      };

      const content = data.choices?.[0]?.message?.content || '';

      // ── DEBUG: Full response log ──
      if (DEBUG) {
        const usage = data.usage;
        debugLog(`RESPONSE (${res.status})`, {
          status: res.status,
          id: data.id,
          model: data.model,
          latencyMs,
          usage: usage ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          } : 'N/A',
          contentPreview: content.slice(0, 500) + (content.length > 500 ? `\n... [${content.length - 500} more chars]` : ''),
          contentLength: content.length,
          contentFull: content,
        });
      }

      return content;
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;

      // ── DEBUG: Exception log ──
      if (DEBUG) {
        debugLog('EXCEPTION', {
          error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
          latencyMs,
        });
      }

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
