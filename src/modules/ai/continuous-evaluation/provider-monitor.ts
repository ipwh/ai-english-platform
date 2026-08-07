// ============================================
// Provider Monitor — tracks provider health
// metrics over time.
//
// Monitors: success rate, failure rate, retry
// rate, fallback rate, latency, cost, JSON
// repair rate.
// ============================================

import type { ScoreRecord } from './score-history';

// ── Types ──

/** Provider health snapshot */
export interface ProviderHealth {
  provider: string;
  /** Total evaluations tracked */
  totalEvaluations: number;
  /** Successful evaluations */
  successfulEvaluations: number;
  /** Failed evaluations */
  failedEvaluations: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Failure rate (0-1) */
  failureRate: number;
  /** Average retry count */
  avgRetryCount: number;
  /** Rate of provider fallbacks (when this provider was primary but failed) */
  fallbackRate: number;
  /** Average latency */
  avgLatencyMs: number;
  /** Average cost */
  avgCostUsd: number;
  /** Rate of JSON repair needed */
  jsonRepairRate: number;
  /** Health status */
  status: ProviderStatus;
  /** When this snapshot was taken */
  timestamp: string;
}

/** Provider status classification */
export type ProviderStatus = 'healthy' | 'degraded' | 'unhealthy' | 'down';

export const PROVIDER_STATUS_ICONS: Record<ProviderStatus, string> = {
  healthy: '🟢',
  degraded: '🟡',
  unhealthy: '🟠',
  down: '🔴',
};

// ── Public API ──

/**
 * Compute provider health from score records.
 */
export function computeProviderHealth(
  provider: string,
  records: ScoreRecord[],
): ProviderHealth {
  const providerRecords = records.filter(r => r.provider === provider);
  const total = providerRecords.length;

  if (total === 0) {
    return {
      provider,
      totalEvaluations: 0,
      successfulEvaluations: 0,
      failedEvaluations: 0,
      successRate: 1,
      failureRate: 0,
      avgRetryCount: 0,
      fallbackRate: 0,
      avgLatencyMs: 0,
      avgCostUsd: 0,
      jsonRepairRate: 0,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }

  const successful = providerRecords.filter(r => r.success);
  const failed = providerRecords.filter(r => !r.success);
  const withRetries = providerRecords.filter(r => r.retryCount > 0);
  const withRepairs = providerRecords.filter(r => r.jsonRepairCount > 0);

  const successRate = successful.length / total;
  const avgLatency = successful.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, successful.length);
  const avgCost = successful.reduce((s, r) => s + r.costUsd, 0) / Math.max(1, successful.length);

  const status = classifyProviderStatus(successRate, avgLatency);

  return {
    provider,
    totalEvaluations: total,
    successfulEvaluations: successful.length,
    failedEvaluations: failed.length,
    successRate,
    failureRate: failed.length / total,
    avgRetryCount: providerRecords.reduce((s, r) => s + r.retryCount, 0) / total,
    fallbackRate: 0, // Requires external context to compute accurately
    avgLatencyMs: Math.round(avgLatency),
    avgCostUsd: Math.round(avgCost * 100000) / 100000,
    jsonRepairRate: withRepairs.length / total,
    status,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Compute health for all providers in records.
 */
export function computeAllProviderHealth(
  records: ScoreRecord[],
): ProviderHealth[] {
  const providers = new Set(records.map(r => r.provider));
  return [...providers].map(p => computeProviderHealth(p, records));
}

/**
 * Compare provider health over two time windows.
 */
export function compareProviderHealth(
  current: ProviderHealth,
  previous: ProviderHealth,
): {
  provider: string;
  successRateDelta: number;
  latencyDelta: number;
  costDelta: number;
  degraded: boolean;
  summary: string;
} {
  const successRateDelta = current.successRate - previous.successRate;
  const latencyDelta = current.avgLatencyMs - previous.avgLatencyMs;
  const costDelta = current.avgCostUsd - previous.avgCostUsd;
  const degraded = successRateDelta < -0.05 || latencyDelta > 500;

  return {
    provider: current.provider,
    successRateDelta: Math.round(successRateDelta * 10000) / 100,
    latencyDelta: Math.round(latencyDelta),
    costDelta: Math.round(costDelta * 100000) / 100000,
    degraded,
    summary: degraded
      ? `${current.provider} degraded: success ${(successRateDelta * 100).toFixed(1)}%, latency +${latencyDelta.toFixed(0)}ms`
      : `${current.provider} stable`,
  };
}

// ── Classification ──

function classifyProviderStatus(
  successRate: number,
  avgLatencyMs: number,
): ProviderStatus {
  if (successRate < 0.5) return 'down';
  if (successRate < 0.8) return 'unhealthy';
  if (successRate < 0.95 || avgLatencyMs > 5000) return 'degraded';
  return 'healthy';
}

// ── Provider Trends ──

/**
 * Compute provider trend over time from snapshots.
 */
export function computeProviderTrend(
  provider: string,
  snapshots: ProviderHealth[],
): {
  successRateTrend: 'improving' | 'stable' | 'declining';
  latencyTrend: 'improving' | 'stable' | 'declining';
  recommendation: string;
} {
  if (snapshots.length < 2) {
    return {
      successRateTrend: 'stable',
      latencyTrend: 'stable',
      recommendation: 'Insufficient data for trend analysis.',
    };
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  const srChange = last.successRate - first.successRate;
  const latChange = last.avgLatencyMs - first.avgLatencyMs;

  const successRateTrend: 'improving' | 'stable' | 'declining' =
    srChange > 0.02 ? 'improving' :
    srChange < -0.02 ? 'declining' : 'stable';

  const latencyTrend: 'improving' | 'stable' | 'declining' =
    latChange < -200 ? 'improving' :
    latChange > 200 ? 'declining' : 'stable';

  let recommendation = `${provider} is stable.`;
  if (successRateTrend === 'declining') {
    recommendation = `${provider} success rate declining — consider adjusting fallback priority.`;
  } else if (latencyTrend === 'declining') {
    recommendation = `${provider} latency increasing — monitor for timeout risks.`;
  }

  return { successRateTrend, latencyTrend, recommendation };
}
