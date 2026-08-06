// ============================================
// Benchmark Scenarios — predefined AI benchmark suites
// Used by: scripts/benchmark-ai.ts (CLI tool)
// Classification: TOOLING — developer benchmarking infrastructure
// ============================================

import type { BenchmarkScenario } from './benchmark-types';

export const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  {
    name: 'latency-baseline',
    description: 'Measure baseline LLM call latency',
    category: 'latency',
    iterations: 10,
    warmupIterations: 2,
  },
  {
    name: 'quality-consistency',
    description: 'Measure output quality consistency across repeated calls',
    category: 'quality',
    iterations: 5,
  },
  {
    name: 'reliability-failover',
    description: 'Test provider failover under simulated failures',
    category: 'reliability',
    iterations: 3,
  },
  {
    name: 'cost-estimation',
    description: 'Estimate token costs per scenario',
    category: 'cost',
    iterations: 5,
  },
];
