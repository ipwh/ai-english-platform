// ============================================
// Benchmark Runner — executes benchmark scenarios
// Used by: scripts/benchmark-ai.ts (CLI tool)
// Classification: TOOLING — developer benchmarking infrastructure
// ============================================

import type { BenchmarkScenario, BenchmarkResult, BenchmarkReport } from './benchmark-types';

/**
 * Run a suite of benchmark scenarios and collect timing/error data.
 * Pure measurement — does not call AI directly.
 * The CLI script orchestrates AI calls and passes timing data here.
 */
export async function runBenchmarkSuite(
  scenarios: BenchmarkScenario[],
  runner: (scenario: BenchmarkScenario) => Promise<{
    durations: number[];
    errors: string[];
  }>,
): Promise<BenchmarkReport> {
  const results: BenchmarkResult[] = [];

  for (const scenario of scenarios) {
    // Warmup
    if (scenario.warmupIterations && scenario.warmupIterations > 0) {
      for (let i = 0; i < scenario.warmupIterations; i++) {
        await runner(scenario);
      }
    }

    const timingData: number[] = [];
    const allErrors: string[] = [];

    const start = Date.now();
    for (let i = 0; i < scenario.iterations; i++) {
      const iterStart = Date.now();
      try {
        await runner(scenario);
        timingData.push(Date.now() - iterStart);
      } catch (err) {
        allErrors.push(String(err));
      }
    }
    const totalDurationMs = Date.now() - start;

    const sorted = [...timingData].sort((a, b) => a - b);
    const n = sorted.length;

    results.push({
      scenario: scenario.name,
      category: scenario.category,
      iterations: scenario.iterations,
      totalDurationMs,
      avgDurationMs: n > 0 ? sorted.reduce((a, b) => a + b, 0) / n : 0,
      minDurationMs: n > 0 ? sorted[0] : 0,
      maxDurationMs: n > 0 ? sorted[n - 1] : 0,
      p50Ms: n > 0 ? sorted[Math.floor(n * 0.5)] : 0,
      p95Ms: n > 0 ? sorted[Math.floor(n * 0.95)] : 0,
      p99Ms: n > 0 ? sorted[Math.floor(n * 0.99)] : 0,
      successCount: scenario.iterations - allErrors.length,
      failureCount: allErrors.length,
      errors: allErrors,
    });
  }

  const totalDurationMs = results.reduce((s, r) => s + r.totalDurationMs, 0);
  const totalSuccess = results.reduce((s, r) => s + r.successCount, 0);
  const totalAttempts = results.reduce((s, r) => s + r.iterations, 0);

  const categories = new Map<string, number>();
  for (const r of results) {
    categories.set(r.category, (categories.get(r.category) || 0) + 1);
  }

  return {
    timestamp: new Date().toISOString(),
    totalScenarios: scenarios.length,
    results,
    summary: {
      totalDurationMs,
      overallSuccessRate: totalAttempts > 0 ? totalSuccess / totalAttempts : 0,
      scenariosByCategory: Object.fromEntries(categories),
    },
  };
}
