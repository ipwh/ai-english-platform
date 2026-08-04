// Sprint 13: AI Cost Optimization — types

export type AIModel = 'deepseek-v4-flash' | 'deepseek-v4-pro' | 'deepseek-reasoner' | 'gemini-2.0-flash' | 'gemini-2.5-flash' | 'vertex-gemini';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostEntry {
  id: string;
  model: AIModel;
  timestamp: Date;
  promptHash: string;
  tokenUsage: TokenUsage;
  costUSD: number;
  cached: boolean;
  /** Whether this was a batched request */
  batched: boolean;
}

export interface ModelPricing {
  model: AIModel;
  inputPricePer1K: number;   // USD per 1000 input tokens
  outputPricePer1K: number;  // USD per 1000 output tokens
}

export interface CostSummary {
  totalCostUSD: number;
  totalTokens: TokenUsage;
  totalRequests: number;
  cachedRequests: number;
  batchedRequests: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Estimated savings from caching */
  estimatedSavingsUSD: number;
  byModel: Record<string, { requests: number; costUSD: number; tokens: TokenUsage }>;
  byDay: Record<string, { requests: number; costUSD: number }>;
}

export interface BatchGroup {
  model: AIModel;
  prompts: string[];
  promptHashes: string[];
  estimatedTokens: number;
}

export interface DedupResult {
  isDuplicate: boolean;
  hash: string;
  existingEntry?: CostEntry;
}
