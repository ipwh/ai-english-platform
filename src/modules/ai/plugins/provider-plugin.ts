// Sprint 86: AI Provider Plugin — interface for dynamically registered AI providers
// Providers implement this interface. providerRegistry delegates to plugins.

import type { PlatformPlugin } from '@/modules/platform/plugins/plugin';
import type { ChatMessage } from '@/modules/ai/providers/types';

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsJSON: boolean;
  supportsEmbedding: boolean;
  supportsFunctionCalling: boolean;
}

export interface ProviderCallResult {
  text: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ProviderPlugin extends PlatformPlugin {
  /** Provider display name (e.g., "DeepSeek", "Gemini") */
  providerName: string;
  /** Provider capabilities */
  capabilities: ProviderCapabilities;
  /** Check if this provider is currently available */
  isAvailable(): boolean;
  /** Execute a chat completion call */
  call(messages: ChatMessage[], options?: Record<string, unknown>): Promise<ProviderCallResult>;
}
