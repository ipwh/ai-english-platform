// ============================================
// AI Provider Interface — contract for all LLM providers
// Sprint 3: AI Provider Abstraction
// ============================================

import type { ChatMessage, LLMCallOptions } from './types';

export interface AIProvider {
  /** Unique provider identifier */
  readonly name: string;
  /** Whether this provider is configured and available */
  isConfigured(): boolean;
  /** Core LLM call — send messages and get response text */
  call(messages: ChatMessage[], options?: LLMCallOptions): Promise<string>;
  /** Higher-level: generate exercises/questions */
  generateExercise?(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string>;
  /** Higher-level: grade/analyze an essay */
  gradeEssay?(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string>;
  /** Higher-level: generate feedback on an answer */
  generateFeedback?(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string>;
  /** Higher-level: chat / study help */
  chat?(messages: ChatMessage[], options?: LLMCallOptions): Promise<string>;
  /** Higher-level: diagnostic / progress analysis */
  diagnose?(systemPrompt: string, userPrompt: string, options?: LLMCallOptions): Promise<string>;
}

/** Factory: check if a provider is configured */
export function isProviderAvailable(provider: AIProvider): boolean {
  try { return provider.isConfigured(); } catch { return false; }
}
