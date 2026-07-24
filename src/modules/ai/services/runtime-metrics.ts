// Sprint 83: Runtime Metrics — in-memory metrics tracking for AI pipeline

interface ProviderMetric {
  calls: number;
  successes: number;
  failures: number;
  totalLatencyMs: number;
  fallbackCount: number;
}

interface RuntimeStats {
  providers: Record<string, ProviderMetric>;
  cacheHits: number;
  cacheMisses: number;
  validationFailures: number;
  jsonRepairs: number;
  retryCount: number;
  totalCalls: number;
  totalLatencyMs: number;
}

const stats: RuntimeStats = {
  providers: {},
  cacheHits: 0,
  cacheMisses: 0,
  validationFailures: 0,
  jsonRepairs: 0,
  retryCount: 0,
  totalCalls: 0,
  totalLatencyMs: 0,
};

function ensureProvider(name: string): ProviderMetric {
  if (!stats.providers[name]) {
    stats.providers[name] = { calls: 0, successes: 0, failures: 0, totalLatencyMs: 0, fallbackCount: 0 };
  }
  return stats.providers[name];
}

export function recordProviderCall(provider: string, success: boolean, latencyMs: number, isFallback = false): void {
  const p = ensureProvider(provider);
  p.calls++;
  if (success) p.successes++; else p.failures++;
  p.totalLatencyMs += latencyMs;
  if (isFallback) p.fallbackCount++;
}

export function recordCacheResult(hit: boolean): void {
  if (hit) stats.cacheHits++; else stats.cacheMisses++;
}

export function recordValidationFailure(): void { stats.validationFailures++; }
export function recordJsonRepair(): void { stats.jsonRepairs++; }
export function recordRetry(): void { stats.retryCount++; }
export function recordPipelineCall(latencyMs: number): void {
  stats.totalCalls++;
  stats.totalLatencyMs += latencyMs;
}

export function getRuntimeMetrics() {
  const providerStats = Object.entries(stats.providers).map(([name, p]) => ({
    provider: name,
    calls: p.calls,
    successes: p.successes,
    failures: p.failures,
    avgLatencyMs: p.calls > 0 ? Math.round(p.totalLatencyMs / p.calls) : 0,
    fallbackCount: p.fallbackCount,
    successRate: p.calls > 0 ? Math.round((p.successes / p.calls) * 100) : 0,
  }));

  return {
    totalCalls: stats.totalCalls,
    avgLatencyMs: stats.totalCalls > 0 ? Math.round(stats.totalLatencyMs / stats.totalCalls) : 0,
    cacheHitRatio: (stats.cacheHits + stats.cacheMisses) > 0
      ? Math.round((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100) / 100
      : 0,
    validationFailures: stats.validationFailures,
    jsonRepairs: stats.jsonRepairs,
    totalRetries: stats.retryCount,
    providers: providerStats,
  };
}

export function resetRuntimeMetrics(): void {
  stats.providers = {};
  stats.cacheHits = 0;
  stats.cacheMisses = 0;
  stats.validationFailures = 0;
  stats.jsonRepairs = 0;
  stats.retryCount = 0;
  stats.totalCalls = 0;
  stats.totalLatencyMs = 0;
}
