// ============================================
// Benchmark Types — shared types for AI benchmarking
// Used by: scripts/benchmark-ai.ts (CLI tool)
// Classification: TOOLING — developer benchmarking infrastructure
// ============================================

export interface BenchmarkScenario {
  name: string;
  description: string;
  category: 'latency' | 'quality' | 'reliability' | 'cost';
  iterations: number;
  warmupIterations?: number;
}

export interface BenchmarkResult {
  scenario: string;
  category: string;
  iterations: number;
  totalDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  successCount: number;
  failureCount: number;
  errors: string[];
}

export interface BenchmarkReport {
  timestamp: string;
  totalScenarios: number;
  results: BenchmarkResult[];
  summary: {
    totalDurationMs: number;
    overallSuccessRate: number;
    scenariosByCategory: Record<string, number>;
  };
}
