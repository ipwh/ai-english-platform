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
}

export interface ProviderCallResult {
  text: string;
  provider: string;
  latencyMs: number;
  fallback: boolean;
}
