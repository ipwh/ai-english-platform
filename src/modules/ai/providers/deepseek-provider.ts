// ============================================
// DeepSeekProvider — DeepSeek API (primary provider)
// Model names (V4.1, 2026-09-14): `deepseek-flash` (default) | `deepseek-v4-pro`
//
// THINKING POLICY: thinking mode is OPT-IN. The API turns thinking ON (effort
// `high`) whenever the request omits the field, which silently (a) drops
// `temperature`, (b) spends `max_tokens` on `reasoning_content` before the
// answer, and (c) triples latency. Every prompt, token budget, timeout and
// cache threshold in this codebase was tuned for the non-thinking path, so
// omitting the field is treated as "disabled" and callers that genuinely need
// multi-step reasoning must pass `thinking: true` (+ optional
// `reasoningEffort`) and raise `maxTokens`/`timeoutMs` accordingly.
// See /guides/thinking_mode in the DeepSeek docs.
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
  logger.info({ module: 'deepseek-debug' }, `\n[DEEPSEEK DEBUG] ========== ${label} ==========\n${line}\n`);
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

    // DeepSeek V4.1 enables thinking (effort `high`) whenever the field is omitted,
    // and the API IGNORES `temperature` while thinking is on.
    //
    // Measured 2026-09-15 against the production model (`deepseek-flash`) with the
    // real writing-analysis prompt and `max_tokens: 4096`:
    //   omitted  → 21.1s, 4096 completion tokens, 13,007 chars of reasoning,
    //              `content` EMPTY (the whole budget went to the chain-of-thought)
    //   disabled →  6.3s, 1286 completion tokens, complete JSON, temperature honoured
    // The empty answer is an HTTP 200, so callers see "no CLO scores" instead of a
    // failure. Omitting the field therefore means "disabled" here — see the file
    // header for the policy. Callers opt in with `thinking: true`.
    // Refs: api-docs.deepseek.com/zh-cn/guides/thinking_mode (2026-09-14)
    const thinkingEnabled = options?.thinking === true;

    const requestBody = {
      model: config.deepseek.model,
      messages,
      ...(thinkingEnabled ? {} : { temperature: options?.temperature ?? 0.7 }),
      max_tokens: options?.maxTokens ?? 1024,
      response_format: options?.jsonMode ? { type: 'json_object' as const } : undefined,
      thinking: { type: thinkingEnabled ? 'enabled' as const : 'disabled' as const },
      ...(options?.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
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
      thinking: options?.thinking,
      reasoningEffort: options?.reasoningEffort,
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

      if (!res.ok) {
        const errText = await res.text();
        const latencyMs = Date.now() - startTime;

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
        choices?: { message?: { content?: string; reasoning_content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
        id?: string;
      };

      // In thinking mode the chain-of-thought comes back separately in `reasoning_content`;
      // only the final answer (`content`) is returned to callers.
      const content = data.choices?.[0]?.message?.content || '';
      const reasoningContent = data.choices?.[0]?.message?.reasoning_content || '';
      const latencyMs = Date.now() - startTime;

      // HTTP 200 with an empty answer means the token budget was consumed before
      // any answer was produced (reasoning chain, or a truncated JSON body).
      // Surface it as a provider-level warning so callers' fail-closed paths are
      // traceable instead of looking like "the AI graded without scores".
      if (!content.trim()) {
        logger.warn({
          module: 'deepseek',
          latencyMs,
          completionTokens: data.usage?.completion_tokens,
          reasoningChars: reasoningContent.length,
          finishReason: (data.choices?.[0] as { finish_reason?: string } | undefined)?.finish_reason,
        }, 'DeepSeek returned an empty answer');
      }

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
          reasoningChars: reasoningContent.length,
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
