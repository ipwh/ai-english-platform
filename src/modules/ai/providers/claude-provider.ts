// ============================================
// ClaudeProvider — Anthropic Claude (placeholder)
// Sprint 3: AI Provider Abstraction
// ============================================

import type { AIProvider } from './provider-interface';
import type { ChatMessage, LLMCallOptions } from './types';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';

  isConfigured(): boolean { return false; }

  async call(_messages: ChatMessage[], _options?: LLMCallOptions): Promise<string> {
    throw new Error('Claude provider not yet implemented. Set ANTHROPIC_API_KEY to enable.');
  }

  async generateExercise(s: string, u: string, o?: LLMCallOptions) { return this.call([{ role: 'system', content: s }, { role: 'user', content: u }], o); }
  async gradeEssay(s: string, u: string, o?: LLMCallOptions) { return this.call([{ role: 'system', content: s }, { role: 'user', content: u }], o); }
  async generateFeedback(s: string, u: string, o?: LLMCallOptions) { return this.call([{ role: 'system', content: s }, { role: 'user', content: u }], o); }
  async chat(m: ChatMessage[], o?: LLMCallOptions) { return this.call(m, o); }
  async diagnose(s: string, u: string, o?: LLMCallOptions) { return this.call([{ role: 'system', content: s }, { role: 'user', content: u }], o); }
}

export const claudeProvider = new ClaudeProvider();
