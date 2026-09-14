// ============================================
// AI Provider Types — shared types for provider layer
// Sprint 3: AI Provider Abstraction
// ============================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCallOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  userId?: string;
  /**
   * DeepSeek V4.1 thinking-mode override. `undefined` keeps the API default
   * (thinking enabled, effort `high`). While thinking is enabled the API ignores
   * `temperature` — set `false` when a deterministic temperature is required.
   * Non-DeepSeek providers ignore this field.
   */
  thinking?: boolean;
  /** Thinking intensity used when thinking is enabled (DeepSeek only; API default `high`). */
  reasoningEffort?: 'low' | 'high' | 'max';
}

export interface ProviderCallResult {
  text: string;
  provider: string;
  latencyMs: number;
  fallback: boolean;
}
