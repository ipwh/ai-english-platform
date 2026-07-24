// Sprint 96: Benchmark Types — shared interfaces for AI benchmarking

export type BenchmarkScenarioName =
  | 'generateQuestions'
  | 'analyzeAnswer'
  | 'analyzeWriting'
  | 'explainMistake';

export interface BenchmarkScenario {
  name: BenchmarkScenarioName;
  description: string;
  input: Record<string, unknown>;
  /** Number of warm-up runs (excluded from metrics) */
  warmupRuns: number;
  /** Number of measured runs */
  measuredRuns: number;
}

export interface BenchmarkResult {
  scenario: BenchmarkScenarioName;
  runs: RunMetrics[];
  aggregate: AggregateMetrics;
  providerDistribution: Record<string, number>;
}

export interface RunMetrics {
  runIndex: number;
  latencyMs: number;
  tokenUsage: { input: number; output: number; total: number };
  retryCount: number;
  providerUsed: string;
  fallbackCount: number;
  cacheHit: boolean;
  jsonRepairCount: number;
  validationFailed: boolean;
  success: boolean;
  error?: string;
}

export interface AggregateMetrics {
  count: number;
  successCount: number;
  failureCount: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  avgTokens: { input: number; output: number; total: number };
  totalRetries: number;
  totalFallbacks: number;
  cacheHitRatio: number;
  jsonRepairRate: number;
  validationFailureRate: number;
}

export interface BenchmarkSuite {
  suiteName: string;
  startedAt: string;
  completedAt?: string;
  results: BenchmarkResult[];
  summary: BenchmarkSummary;
}

export interface BenchmarkSummary {
  totalRuns: number;
  totalFailures: number;
  overallP50Ms: number;
  overallP95Ms: number;
  providerComparison: Record<string, { calls: number; avgMs: number; fallbackRate: number }>;
  scenarioComparison: Record<string, { avgMs: number; successRate: number }>;
}
