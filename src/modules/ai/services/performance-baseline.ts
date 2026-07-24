// Sprint 96: Performance Baseline — tracks and persists performance metrics
import { getRuntimeMetrics } from './runtime-metrics';
import { logger } from '@/shared/logger/logger';

interface LatencyPercentiles {
  p50: number; p90: number; p95: number; avg: number;
}

interface ProviderBaseline {
  name: string; calls: number; avgLatencyMs: number; successRate: number;
}

interface PerformanceBaseline {
  capturedAt: string;
  latency: LatencyPercentiles;
  providers: ProviderBaseline[];
  cacheHitRatio: number;
  validationFailureRate: number;
  jsonRepairRate: number;
  totalCalls: number;
}

let savedBaseline: PerformanceBaseline | null = null;

export function capturePerformanceBaseline(): PerformanceBaseline {
  const m = getRuntimeMetrics();
  const providers: ProviderBaseline[] = (m.providers || []).map((p: Record<string, unknown>) => ({
    name: String(p.provider || 'unknown'),
    calls: Number(p.calls || 0),
    avgLatencyMs: Number(p.avgLatencyMs || 0),
    successRate: Number(p.successRate || 0),
  }));

  const baseline: PerformanceBaseline = {
    capturedAt: new Date().toISOString(),
    latency: { p50: 0, p90: 0, p95: 0, avg: Number(m.avgLatencyMs || 0) },
    providers,
    cacheHitRatio: Number(m.cacheHitRatio || 0),
    validationFailureRate: m.totalCalls > 0 ? m.validationFailures / m.totalCalls : 0,
    jsonRepairRate: m.totalCalls > 0 ? m.jsonRepairs / m.totalCalls : 0,
    totalCalls: m.totalCalls,
  };

  savedBaseline = baseline;
  logger.info({ module: 'performance-baseline', totalCalls: baseline.totalCalls }, 'Performance baseline captured');
  return baseline;
}

export function getPerformanceBaseline(): PerformanceBaseline | null {
  return savedBaseline;
}

export function getPerformanceBaselineReport() {
  const baseline = savedBaseline;
  if (!baseline) return null;

  const m = getRuntimeMetrics();

  return {
    baseline,
    current: {
      avgLatencyMs: m.avgLatencyMs,
      totalCalls: m.totalCalls,
      cacheHitRatio: m.cacheHitRatio,
      providerCount: m.providers?.length || 0,
    },
    comparison: {
      latencyDelta: baseline.totalCalls > 0
        ? `${((m.avgLatencyMs - baseline.latency.avg) / Math.max(1, baseline.latency.avg) * 100).toFixed(1)}%`
        : 'N/A',
    },
  };
}
