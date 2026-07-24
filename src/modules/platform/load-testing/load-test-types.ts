// Sprint 97: Load Testing Types — shared interfaces for load/stress testing

export type LoadPattern = 'single' | 'burst' | 'sustained' | 'mixed';

export interface LoadScenario {
  name: string;
  description: string;
  pattern: LoadPattern;
  /** Number of concurrent virtual users */
  concurrency: number;
  /** Total requests to send (for sustained/burst) */
  totalRequests: number;
  /** Delay between batch starts in ms (for burst) */
  burstDelayMs?: number;
  /** Duration in ms (for sustained) */
  durationMs?: number;
  /** Request function name to call */
  targetFn: string;
  /** Input for each request */
  input: Record<string, unknown>;
}

export interface LoadResult {
  scenario: string;
  pattern: LoadPattern;
  concurrency: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalRequests: number;
  successful: number;
  failed: number;
  successRate: number;
  latency: LatencyStats;
  throughput: ThroughputStats;
  providerUtilization: Record<string, ProviderLoadStats>;
  memory: MemoryStats;
  errors: LoadError[];
}

export interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface ThroughputStats {
  requestsPerSecond: number;
  avgResponseTimeMs: number;
  peakConcurrency: number;
  queueDepth: number;
}

export interface ProviderLoadStats {
  calls: number;
  successes: number;
  failures: number;
  avgLatencyMs: number;
  fallbackCount: number;
  saturationPercent: number;
}

export interface MemoryStats {
  beforeMB: number;
  afterMB: number;
  deltaMB: number;
  growthRateMBps: number;
}

export interface LoadError {
  requestIndex: number;
  error: string;
  latencyMs: number;
  provider?: string;
}

export interface LoadSuite {
  suiteName: string;
  startedAt: string;
  completedAt?: string;
  results: LoadResult[];
  summary: LoadSummary;
}

export interface LoadSummary {
  totalRequests: number;
  totalFailures: number;
  overallSuccessRate: number;
  overallP95Ms: number;
  maxConcurrency: number;
  avgThroughput: number;
  providerSaturation: Record<string, number>;
}
