// Sprint 84: Execution Policy — canonical execution parameters for AI calls
// All pipelines consume an ExecutionPolicy instead of scattered options.

export interface ExecutionPolicy {
  /** Maximum retry attempts (0 = no retry) */
  maxRetries: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Whether streaming is enabled */
  streamingEnabled: boolean;
  /** Preferred provider name (empty = auto-select) */
  preferredProvider: string;
  /** Whether provider fallback chain is enabled */
  fallbackEnabled: boolean;
  /** Whether AI response caching is enabled */
  cacheEnabled: boolean;
  /** Schema validation mode */
  validationMode: 'strict' | 'lenient';
  /** LLM temperature (0-1) */
  temperature: number;
  /** Maximum output tokens */
  maxTokens: number;
}

/** Default execution policy — safe defaults for all AI calls */
export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  maxRetries: 2,
  timeoutMs: 25000,
  streamingEnabled: false,
  preferredProvider: '',
  fallbackEnabled: true,
  cacheEnabled: true,
  validationMode: 'strict',
  temperature: 0.7,
  maxTokens: 2048,
};

/** JSON mode policy — strict validation, lower temperature */
export const JSON_EXECUTION_POLICY: ExecutionPolicy = {
  ...DEFAULT_EXECUTION_POLICY,
  temperature: 0.3,
  maxTokens: 4096,
  validationMode: 'strict',
};
