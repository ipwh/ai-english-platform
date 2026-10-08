// ============================================
// Provider availability — which LLM providers this deployment can actually call
// ============================================
//
// 2026-10-08: moved out of ai/services/ai-service.ts. Reading provider credentials is
// provider-layer knowledge (architecture rule: "Provider-specific code (fetch + API key)
// only in providers/ or ai-legacy"), and the AI facade re-exports these names so the
// public API is unchanged.
//
// NOTE: `config.gemini.apiKey` still counts as "configured" here even though the Gemini
// API key was retired 2026-08-20 — this mirrors the historical health-reporting behaviour
// and is reported (never used to select a provider).
// ============================================

import { config } from '@/shared/config/config';
import { hasServiceAccountSource } from '@/modules/ai/services/gcp-auth';

/** Vertex Gemini is usable only with both a project id and a resolvable service account. */
export function isVertexGeminiConfigured(): boolean {
  return !!config.vertex.projectId && hasServiceAccountSource();
}

export function isAIConfigured(): boolean {
  return (!!config.deepseek.apiKey && config.deepseek.apiKey !== 'sk-your-deepseek-api-key-here')
    || (!!config.vertex.projectId && hasServiceAccountSource())
    || !!config.gemini.apiKey;
}

export function isDeepSeekConfigured(): boolean {
  return isAIConfigured();
}

export function getAIProviders() {
  return {
    deepseek: !!config.deepseek.apiKey && config.deepseek.apiKey !== 'sk-your-deepseek-api-key-here',
    vertexGemini: isVertexGeminiConfigured(), geminiApiKey: !!config.gemini.apiKey,
    vertexProjectId: config.vertex.projectId || null, vertexLocation: config.vertex.location, vertexModel: config.vertex.model,
  };
}
