// Sprint 84: Timeout Policy — centralized timeout configuration
// No duplicated timeout values across the codebase.

export interface TimeoutPolicy {
  /** Default request timeout (ms) */
  default: number;
  /** JSON mode timeout (longer for structured output) */
  jsonMode: number;
  /** Streaming timeout (longer for SSE) */
  streaming: number;
  /** Per-provider timeout overrides */
  providers: Record<string, number>;
}

const DEFAULT_TIMEOUT_POLICY: TimeoutPolicy = {
  default: 25000,
  jsonMode: 30000,
  streaming: 60000,
  providers: {},
};

let timeoutPolicy: TimeoutPolicy = { ...DEFAULT_TIMEOUT_POLICY };

export function getTimeoutPolicy(): TimeoutPolicy {
  return { ...timeoutPolicy };
}

export function getTimeoutMs(options?: {
  jsonMode?: boolean;
  streaming?: boolean;
  provider?: string;
}): number {
  if (options?.provider && timeoutPolicy.providers[options.provider]) {
    return timeoutPolicy.providers[options.provider];
  }
  if (options?.streaming) return timeoutPolicy.streaming;
  if (options?.jsonMode) return timeoutPolicy.jsonMode;
  return timeoutPolicy.default;
}

export function setTimeoutPolicy(policy: Partial<TimeoutPolicy>): void {
  timeoutPolicy = { ...timeoutPolicy, ...policy };
}

export function resetTimeoutPolicy(): void {
  timeoutPolicy = { ...DEFAULT_TIMEOUT_POLICY };
}
