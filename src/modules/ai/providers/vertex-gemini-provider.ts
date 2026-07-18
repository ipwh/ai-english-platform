// ============================================
// VertexGeminiProvider — Gemini via GCP Vertex AI
// Sprint 3: AI Provider Abstraction
// ============================================

import type { AIProvider } from './provider-interface';
import type { ChatMessage, LLMCallOptions } from './types';
import { config } from '@/shared/config/config';
import { hasServiceAccountSource, getGoogleAuth } from '@/modules/ai/services/gcp-auth';

const GEMINI_JSON_INSTRUCTION = '\n⚠️ IMPORTANT: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no extra text. Start with { or [.';

let cachedAuth: ReturnType<typeof getGoogleAuth> | null = null;
function getAuth() { if (!cachedAuth) cachedAuth = getGoogleAuth(); return cachedAuth; }

export class VertexGeminiProvider implements AIProvider {
  readonly name = 'vertex-gemini';

  isConfigured(): boolean {
    return !!config.vertex.projectId && hasServiceAccountSource();
  }

  async call(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
    const projectId = config.vertex.projectId;
    const location = config.vertex.location;
    const model = config.vertex.model;

    if (!projectId) throw new Error('Vertex Gemini: GCP_PROJECT_ID not configured.');
    if (!hasServiceAccountSource()) throw new Error('Vertex Gemini: no service account credentials.');

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
      const auth = getAuth();
      const client = await auth.getClient();
      const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
      const url = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
      const token = await client.getAccessToken();
      if (!token?.token) throw new Error('Vertex Gemini: could not obtain OAuth access token.');

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

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Vertex Gemini error (${res.status}): ${errText.slice(0, 260)}`);
      }

      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
      const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
      if (!content) throw new Error(data.error?.message || 'Vertex Gemini returned empty response.');
      return content;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') throw new Error('Vertex Gemini request timed out.');
      throw err;
    } finally { clearTimeout(timeoutId); }
  }

  async generateExercise(s: string, u: string, o?: LLMCallOptions) { return this.call([{ role: 'system', content: s }, { role: 'user', content: u }], { ...o, jsonMode: true, maxTokens: 4096 }); }
  async gradeEssay(s: string, u: string, o?: LLMCallOptions) { return this.call([{ role: 'system', content: s }, { role: 'user', content: u }], { ...o, jsonMode: true, maxTokens: 2048 }); }
  async generateFeedback(s: string, u: string, o?: LLMCallOptions) { return this.call([{ role: 'system', content: s }, { role: 'user', content: u }], { ...o, jsonMode: true, maxTokens: 2048 }); }
  async chat(m: ChatMessage[], o?: LLMCallOptions) { return this.call(m, { ...o, maxTokens: 2048 }); }
  async diagnose(s: string, u: string, o?: LLMCallOptions) { return this.call([{ role: 'system', content: s }, { role: 'user', content: u }], { ...o, jsonMode: true, maxTokens: 2048 }); }
}

export const vertexGeminiProvider = new VertexGeminiProvider();
