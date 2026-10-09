// Sprint 97: Load Test Runner — executes concurrent load scenarios and collects metrics
import type { LoadScenario, LoadResult, LoadSuite, LoadSummary, LatencyStats, ThroughputStats, ProviderLoadStats, LoadError } from './load-test-types';
import { getRuntimeMetrics } from '@/modules/ai/services/runtime-metrics';
import { logger } from '@/shared/logger/logger';

function computeLatency(latencies: number[]): LatencyStats {
  if (latencies.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    min: sorted[0], max: sorted[sorted.length - 1],
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

function computeThroughput(totalRequests: number, durationMs: number, peak: number): ThroughputStats {
  return {
    requestsPerSecond: durationMs > 0 ? Math.round((totalRequests / (durationMs / 1000)) * 100) / 100 : 0,
    avgResponseTimeMs: durationMs > 0 ? Math.round(durationMs / Math.max(1, totalRequests)) : 0,
    peakConcurrency: peak,
    queueDepth: 0,
  };
}

function computeProviderStats(before: ReturnType<typeof getRuntimeMetrics>, after: ReturnType<typeof getRuntimeMetrics>): Record<string, ProviderLoadStats> {
  const result: Record<string, ProviderLoadStats> = {};
  const allProviders = new Set([...(before.providers || []).map((p: Record<string, unknown>) => p.provider), ...(after.providers || []).map((p: Record<string, unknown>) => p.provider)]);
  for (const name of allProviders) {
    const b = (before.providers || []).find((p: Record<string, unknown>) => p.provider === name) as Record<string, unknown> || {};
    const a = (after.providers || []).find((p: Record<string, unknown>) => p.provider === name) as Record<string, unknown> || {};
    result[String(name)] = {
      calls: Math.max(0, (Number(a.calls) || 0) - (Number(b.calls) || 0)),
      successes: Math.max(0, (Number(a.successes) || 0) - (Number(b.successes) || 0)),
      failures: Math.max(0, (Number(a.failures) || 0) - (Number(b.failures) || 0)),
      avgLatencyMs: Number(a.avgLatencyMs) || 0,
      fallbackCount: Math.max(0, (Number(a.fallbackCount) || 0) - (Number(b.fallbackCount) || 0)),
      saturationPercent: 0,
    };
  }
  return result;
}

function memUsedMB(): number {
  try {
    const mem = process.memoryUsage();
    return Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100;
  } catch { return 0; }
}

export async function runLoadScenario(
  scenario: LoadScenario,
  runner: (input: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>,
): Promise<LoadResult> {
  const latencies: number[] = [];
  const errors: LoadError[] = [];
  const memBefore = memUsedMB();
  const metricsBefore = getRuntimeMetrics();
  const startedAt = new Date().toISOString();
  const start = Date.now();
  let peakConcurrency = 0;

  if (scenario.pattern === 'single') {
    peakConcurrency = 1;
    const t0 = Date.now();
    try { await runner(scenario.input); latencies.push(Date.now() - t0); } catch (e) { errors.push({ requestIndex: 0, error: String(e), latencyMs: Date.now() - t0 }); }
  } else if (scenario.pattern === 'burst') {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < scenario.totalRequests; i++) {
      peakConcurrency = Math.max(peakConcurrency, promises.length);
      const t0 = Date.now();
      const p = runner(scenario.input).then(() => { latencies.push(Date.now() - t0); }).catch(e => { errors.push({ requestIndex: i, error: String(e), latencyMs: Date.now() - t0 }); });
      promises.push(p);
      if (scenario.burstDelayMs && i < scenario.totalRequests - 1) {
        await new Promise(r => setTimeout(r, scenario.burstDelayMs));
      }
    }
    await Promise.allSettled(promises);
  } else if (scenario.pattern === 'sustained') {
    const deadline = Date.now() + (scenario.durationMs || 30000);
    let index = 0;
    while (Date.now() < deadline && index < scenario.totalRequests) {
      const batch: Promise<void>[] = [];
      for (let i = 0; i < scenario.concurrency && index < scenario.totalRequests; i++, index++) {
        peakConcurrency = Math.max(peakConcurrency, batch.length + 1);
        const t0 = Date.now();
        batch.push(runner(scenario.input).then(() => { latencies.push(Date.now() - t0); }).catch(e => { errors.push({ requestIndex: index, error: String(e), latencyMs: Date.now() - t0 }); }));
      }
      await Promise.allSettled(batch);
      await new Promise(r => setTimeout(r, 1000));
    }
  } else {
    // mixed pattern — just run sequentially for now
    for (let i = 0; i < scenario.totalRequests; i++) {
      peakConcurrency = 1;
      const t0 = Date.now();
      try { await runner(scenario.input); latencies.push(Date.now() - t0); } catch (e) { errors.push({ requestIndex: i, error: String(e), latencyMs: Date.now() - t0 }); }
    }
  }

  const durationMs = Date.now() - start;
  const metricsAfter = getRuntimeMetrics();
  const memAfter = memUsedMB();
  const total = scenario.totalRequests;
  const failed = errors.length;

  return {
    scenario: scenario.name, pattern: scenario.pattern, concurrency: scenario.concurrency,
    startedAt, completedAt: new Date().toISOString(), durationMs,
    totalRequests: total, successful: total - failed, failed, successRate: total > 0 ? (total - failed) / total : 0,
    latency: computeLatency(latencies),
    throughput: computeThroughput(total, durationMs, peakConcurrency),
    providerUtilization: computeProviderStats(metricsBefore, metricsAfter),
    memory: { beforeMB: memBefore, afterMB: memAfter, deltaMB: Math.round((memAfter - memBefore) * 100) / 100, growthRateMBps: durationMs > 0 ? Math.round(((memAfter - memBefore) / (durationMs / 1000)) * 100) / 100 : 0 },
    errors,
  };
}

export async function runLoadSuite(suiteName: string, scenarios: LoadScenario[], runners: Record<string, (input: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>>): Promise<LoadSuite> {
  const startedAt = new Date().toISOString();
  const results: LoadResult[] = [];
  logger.info({ module: 'load-test', suiteName, scenarios: scenarios.length }, 'Starting load test suite');
  for (const s of scenarios) {
    const runner = runners[s.targetFn];
    if (!runner) { logger.warn({ module: 'load-test', target: s.targetFn }, 'No runner, skipping'); continue; }
    results.push(await runLoadScenario(s, runner));
  }

  const allReqs = results.reduce((a, r) => a + r.totalRequests, 0);
  const allFailures = results.reduce((a, r) => a + r.failed, 0);
  const allLatencies = results.flatMap(r => r.latency ? [r.latency.p95] : []);
  const summary: LoadSummary = {
    totalRequests: allReqs, totalFailures: allFailures,
    overallSuccessRate: allReqs > 0 ? (allReqs - allFailures) / allReqs : 0,
    overallP95Ms: allLatencies.length > 0 ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length) : 0,
    maxConcurrency: Math.max(...results.map(r => r.concurrency), 1),
    avgThroughput: results.length > 0 ? Math.round(results.reduce((a, r) => a + r.throughput.requestsPerSecond, 0) / results.length * 100) / 100 : 0,
    providerSaturation: {},
  };
  logger.info({ module: 'load-test', suiteName, totalRequests: allReqs }, 'Load test suite complete');
  return { suiteName, startedAt, completedAt: new Date().toISOString(), results, summary };
}
