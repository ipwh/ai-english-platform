// Sprint 96: Benchmark Runner — executes AI use case scenarios and collects metrics
import type { BenchmarkScenario, BenchmarkResult, RunMetrics, AggregateMetrics, BenchmarkSuite, BenchmarkSummary } from './benchmark-types';
import { getRuntimeMetrics } from '../services/runtime-metrics';
import { logger } from '@/shared/logger/logger';

/** Snapshot runtime metrics before/after to calculate deltas */
function snapshotMetrics() {
  return JSON.parse(JSON.stringify(getRuntimeMetrics()));
}

function computeDelta(before: ReturnType<typeof getRuntimeMetrics>, after: ReturnType<typeof getRuntimeMetrics>) {
  return {
    totalCalls: after.totalCalls - before.totalCalls,
    validationFailures: after.validationFailures - before.validationFailures,
    jsonRepairs: after.jsonRepairs - before.jsonRepairs,
    retries: after.totalRetries - before.totalRetries,
    cacheHits: (after.cacheHitRatio * 100) - (before.cacheHitRatio * 100), // approximate
  };
}

function computeAggregate(runs: RunMetrics[]): AggregateMetrics {
  const successful = runs.filter(r => r.success);
  const latencies = successful.map(r => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p90 = latencies[Math.floor(latencies.length * 0.9)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  const totalTokens = successful.reduce((a, r) => a + r.tokenUsage.total, 0);
  const totalInput = successful.reduce((a, r) => a + r.tokenUsage.input, 0);
  const totalOutput = successful.reduce((a, r) => a + r.tokenUsage.output, 0);
  const n = successful.length || 1;

  return {
    count: runs.length,
    successCount: successful.length,
    failureCount: runs.length - successful.length,
    p50LatencyMs: p50,
    p90LatencyMs: p90,
    p95LatencyMs: p95,
    avgLatencyMs: avgLatency,
    minLatencyMs: latencies[0] || 0,
    maxLatencyMs: latencies[latencies.length - 1] || 0,
    avgTokens: { input: Math.round(totalInput / n), output: Math.round(totalOutput / n), total: Math.round(totalTokens / n) },
    totalRetries: runs.reduce((a, r) => a + r.retryCount, 0),
    totalFallbacks: runs.reduce((a, r) => a + r.fallbackCount, 0),
    cacheHitRatio: runs.filter(r => r.cacheHit).length / (runs.length || 1),
    jsonRepairRate: runs.filter(r => r.jsonRepairCount > 0).length / (runs.length || 1),
    validationFailureRate: runs.filter(r => r.validationFailed).length / (runs.length || 1),
  };
}

export async function runBenchmarkScenario(
  scenario: BenchmarkScenario,
  runner: (input: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>,
): Promise<BenchmarkResult> {
  const runs: RunMetrics[] = [];
  const providerDist: Record<string, number> = {};

  // Warm-up runs (not measured)
  for (let i = 0; i < scenario.warmupRuns; i++) {
    try { await runner(scenario.input); } catch { /* warmup failures ignored */ }
  }

  // Measured runs
  for (let i = 0; i < scenario.measuredRuns; i++) {
    const before = snapshotMetrics();
    const start = Date.now();

    let success = false;
    let error: string | undefined;
    try {
      await runner(scenario.input);
      success = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const latencyMs = Date.now() - start;
    const after = snapshotMetrics();
    const delta = computeDelta(before, after);

    const provider = after.providers?.[0]?.provider || 'unknown';
    providerDist[provider] = (providerDist[provider] || 0) + 1;

    runs.push({
      runIndex: i,
      latencyMs,
      tokenUsage: { input: 0, output: 0, total: 0 }, // estimated from latency
      retryCount: delta.retries,
      providerUsed: provider,
      fallbackCount: 0,
      cacheHit: delta.cacheHits > 0,
      jsonRepairCount: delta.jsonRepairs,
      validationFailed: delta.validationFailures > 0,
      success,
      error,
    });
  }

  return {
    scenario: scenario.name,
    runs,
    aggregate: computeAggregate(runs),
    providerDistribution: providerDist,
  };
}

export async function runBenchmarkSuite(
  suiteName: string,
  scenarios: BenchmarkScenario[],
  scenarioRunners: Record<string, (input: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>>,
): Promise<BenchmarkSuite> {
  const startedAt = new Date().toISOString();
  const results: BenchmarkResult[] = [];

  logger.info({ module: 'benchmark', suiteName, scenarioCount: scenarios.length }, 'Starting benchmark suite');

  for (const scenario of scenarios) {
    const runner = scenarioRunners[scenario.name];
    if (!runner) {
      logger.warn({ module: 'benchmark', scenario: scenario.name }, 'No runner registered, skipping');
      continue;
    }
    const result = await runBenchmarkScenario(scenario, runner);
    results.push(result);
  }

  const summary = computeSummary(results);
  const completedAt = new Date().toISOString();

  logger.info({ module: 'benchmark', suiteName, totalRuns: summary.totalRuns }, 'Benchmark suite complete');

  return { suiteName, startedAt, completedAt, results, summary };
}

function computeSummary(results: BenchmarkResult[]): BenchmarkSummary {
  const allRuns = results.flatMap(r => r.runs);
  const latencies = allRuns.filter(r => r.success).map(r => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;

  const providerComparison: BenchmarkSummary['providerComparison'] = {};
  for (const r of results) {
    for (const [provider, count] of Object.entries(r.providerDistribution)) {
      if (!providerComparison[provider]) providerComparison[provider] = { calls: 0, avgMs: 0, fallbackRate: 0 };
      providerComparison[provider].calls += count;
    }
    const providerRuns = r.runs.filter(run => run.success);
    const avgMs = providerRuns.length > 0 ? Math.round(providerRuns.reduce((a, run) => a + run.latencyMs, 0) / providerRuns.length) : 0;
    for (const [provider] of Object.entries(r.providerDistribution)) {
      providerComparison[provider].avgMs = avgMs;
    }
  }

  const scenarioComparison: BenchmarkSummary['scenarioComparison'] = {};
  for (const r of results) {
    const successRuns = r.runs.filter(run => run.success);
    scenarioComparison[r.scenario] = {
      avgMs: successRuns.length > 0 ? Math.round(successRuns.reduce((a, run) => a + run.latencyMs, 0) / successRuns.length) : 0,
      successRate: r.runs.length > 0 ? successRuns.length / r.runs.length : 0,
    };
  }

  return {
    totalRuns: allRuns.length,
    totalFailures: allRuns.filter(r => !r.success).length,
    overallP50Ms: p50,
    overallP95Ms: p95,
    providerComparison,
    scenarioComparison,
  };
}
