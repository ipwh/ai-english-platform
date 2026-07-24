// ============================================
// LLM Call — thin provider registry wrapper
// Extracted from ai-service.ts (Sprint 92)
// Shared by ai-service.ts and ai/usecases/
// ============================================

import { providerRegistry } from '@/modules/ai/providers';
import type { ChatMessage, LLMCallOptions } from '@/modules/ai/providers';

export async function callLLM(
  messages: ChatMessage[],
  options?: LLMCallOptions
): Promise<string> {
  const result = await providerRegistry.call(messages, options);
  return result.text;
}
