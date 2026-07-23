// Sprint 77: Legacy AI direct API calls — extracted from ai-service.ts
// ⚠️ ALL FUNCTIONS DEPRECATED — no longer used.
// All LLM calls now go through providerRegistry.call() (DeepSeek→Vertex→Gemini→Claude→OpenAI fallback).
// These functions remain for reference only. Remove after Q3 2026.

import { config } from '@/shared/config/config';
import { hasServiceAccountSource, getGoogleAuth } from '@/modules/ai/services/gcp-auth';
import type { ChatMessage, LLMCallOptions } from '@/modules/ai/providers';
import { GEMINI_JSON_INSTRUCTION } from '@/modules/ai/prompts';

let vertexAuth: ReturnType<typeof getGoogleAuth> | null = null;

function getVertexAuth() {
  if (vertexAuth) return vertexAuth;
  vertexAuth = getGoogleAuth();
  return vertexAuth;
}

function adaptMessagesForGemini(messages: ChatMessage[], jsonMode: boolean): ChatMessage[] {
  if (!jsonMode) return messages;
  return messages.map(m => {
    if (m.role === 'system') return { ...m, content: m.content + '\n' + GEMINI_JSON_INSTRUCTION };
    return m;
  });
}

interface DeepSeekResponse {
  id: string;
  choices: { message: { role: string; content: string }; finish_reason: string }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

function toGeminiPayload(messages: ChatMessage[]) {
  const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  return { systemMessages, contents };
}

/** @deprecated Use providerRegistry.call() instead. */
export async function _callDeepSeek(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
  if (!config.deepseek.apiKey || config.deepseek.apiKey === 'sk-your-deepseek-api-key-here') {
    throw new Error('AI 服務尚未設定。請在環境變數中設定 config.deepseek.apiKey。');
  }
  const timeoutMs = options?.timeoutMs || config.ai.timeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.deepseek.apiKey}` },
      body: JSON.stringify({
        model: config.deepseek.model, messages,
        temperature: options?.temperature ?? 0.7, max_tokens: options?.maxTokens ?? 1024,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        ...(options?.userId ? { user_id: options.userId } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) { const errText = await res.text(); throw new Error(`AI 服務錯誤 (${res.status}): ${errText.slice(0, 200)}`); }
    const data: DeepSeekResponse = await res.json();
    return data.choices[0]?.message?.content || '';
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error('AI 服務回應超時。');
    throw err;
  } finally { clearTimeout(timeoutId); }
}

/** @deprecated Use providerRegistry.call() instead. */
export async function _callGemini(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
  if (!config.gemini.apiKey) throw new Error('Gemini API 尚未設定。');
  const timeoutMs = options?.timeoutMs || config.ai.timeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const adaptedMessages = adaptMessagesForGemini(messages, options?.jsonMode ?? false);
  const { systemMessages, contents } = toGeminiPayload(adaptedMessages);
  const isJson = options?.jsonMode ?? false;
  try {
    const res = await fetch(`${config.gemini.baseUrl}/models/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    if (!res.ok) { const errText = await res.text(); throw new Error(`Gemini 服務錯誤 (${res.status}): ${errText.slice(0, 200)}`); }
    const data: GeminiResponse = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
    if (!content) throw new Error(data.error?.message || 'Gemini 回傳為空');
    return content;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error('Gemini 回應超時。');
    throw err;
  } finally { clearTimeout(timeoutId); }
}

/** @deprecated Use providerRegistry.call() instead. */
export async function _callGeminiViaVertex(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
  if (!config.vertex.projectId) throw new Error('Vertex Gemini 尚未設定 GCP_PROJECT_ID。');
  if (!hasServiceAccountSource()) throw new Error('Vertex Gemini 尚未設定 service account 憑證。');
  const timeoutMs = options?.timeoutMs || config.ai.timeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const adaptedMessages = adaptMessagesForGemini(messages, options?.jsonMode ?? false);
  const { systemMessages, contents } = toGeminiPayload(adaptedMessages);
  const isJson = options?.jsonMode ?? false;
  try {
    const auth = getVertexAuth();
    const client = await auth.getClient();
    const host = config.vertex.location === 'global' ? 'aiplatform.googleapis.com' : `${config.vertex.location}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${config.vertex.projectId}/locations/${config.vertex.location}/publishers/google/models/${config.vertex.model}:generateContent`;
    const token = await client.getAccessToken();
    if (!token?.token) throw new Error('無法取得 Vertex OAuth access token。');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token.token}`, 'Content-Type': 'application/json' },
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
    if (!res.ok) { const errText = await res.text(); throw new Error(`Vertex Gemini 錯誤 (${res.status}): ${errText.slice(0, 260)}`); }
    const data: GeminiResponse = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
    if (!content) throw new Error(data.error?.message || 'Vertex Gemini 回傳為空');
    return content;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error('Vertex Gemini 回應超時。');
    throw err;
  } finally { clearTimeout(timeoutId); }
}
