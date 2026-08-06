// ============================================
// Benchmark Module — barrel export
// Classification: TOOLING — developer benchmarking infrastructure
// Used by: scripts/benchmark-ai.ts (CLI tool)
// ============================================

export type {
  BenchmarkScenario,
  BenchmarkResult,
  BenchmarkReport,
} from './benchmark-types';

export { BENCHMARK_SCENARIOS } from './benchmark-scenarios';
export { runBenchmarkSuite } from './benchmark-runner';
export { generateMarkdownReport, generateJsonReport } from './benchmark-report';
