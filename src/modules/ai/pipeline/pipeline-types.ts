// Sprint 83: Pipeline Types — canonical types for the AI request pipeline

import type { ChatMessage } from '@/modules/ai/providers';

/** Pipeline stage identifiers */
export type PipelineStage =
  | 'context'
  | 'prompt'
  | 'provider'
  | 'retry'
  | 'parser'
  | 'validation'
  | 'normalization';

/** Timing for a single pipeline stage */
export interface StageTiming {
  stage: PipelineStage;
  startedAt: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

/** Token usage estimate from provider response */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Cost estimate in USD */
export interface CostEstimate {
  provider: string;
  model: string;
  promptCost: number;
  completionCost: number;
  totalCost: number;
}

/** Pipeline execution options */
export interface PipelineOptions {
  userId?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  /** Preferred provider (uses fallback chain if unavailable) */
  preferredProvider?: string;
}

/** Result of a pipeline execution */
export interface PipelineResult<T> {
  /** The validated output data */
  data: T;
  /** Which provider was used */
  provider: string;
  /** Was the result served from cache */
  cacheHit: boolean;
  /** Total pipeline latency in ms */
  totalLatencyMs: number;
  /** Number of retry attempts */
  retryCount: number;
  /** Whether JSON repair was applied */
  repaired: boolean;
  /** Token usage estimate */
  tokenUsage?: TokenUsage;
  /** Cost estimate */
  costEstimate?: CostEstimate;
  /** Pipeline stage timings */
  stages: StageTiming[];
  /** Non-critical warnings */
  warnings: string[];
}
