// Sprint 96: Regression Detector — compares current metrics against saved baseline
import { getPerformanceBaseline, capturePerformanceBaseline } from '../services/performance-baseline';
import { getRuntimeMetrics } from '../services/runtime-metrics';

export type RegressionSeverity = 'none' | 'warning' | 'critical';

export interface RegressionCheck {
  metric: string;
  baseline: number;
  current: number;
  deltaPercent: number;
  severity: RegressionSeverity;
  message: string;
}

export interface RegressionReport {
  timestamp: string;
  hasRegressions: boolean;
  checks: RegressionCheck[];
  summary: string;
}

const CRITICAL_LATENCY_INCREASE = 50; // 50% increase = critical
const WARNING_LATENCY_INCREASE = 25;

function severityFromDelta(deltaPercent: number, warningThreshold: number, criticalThreshold: number): RegressionSeverity {
  if (deltaPercent >= criticalThreshold) return 'critical';
  if (deltaPercent >= warningThreshold) return 'warning';
  return 'none';
}

export function detectRegressions(): RegressionReport {
  const baseline = getPerformanceBaseline();
  if (!baseline) {
    return {
      timestamp: new Date().toISOString(),
      hasRegressions: false,
      checks: [],
      summary: 'No baseline captured yet. Run capturePerformanceBaseline() first.',
    };
  }

  const current = getRuntimeMetrics();
  const checks: RegressionCheck[] = [];

  // Latency regression
  const latencyDelta = baseline.latency.avg > 0
    ? ((current.avgLatencyMs - baseline.latency.avg) / baseline.latency.avg) * 100
    : 0;
  checks.push({
    metric: 'avgLatencyMs',
    baseline: baseline.latency.avg,
    current: current.avgLatencyMs,
    deltaPercent: Math.round(latencyDelta * 10) / 10,
    severity: severityFromDelta(latencyDelta, WARNING_LATENCY_INCREASE, CRITICAL_LATENCY_INCREASE),
    message: latencyDelta >= CRITICAL_LATENCY_INCREASE
      ? `CRITICAL: Latency increased ${Math.round(latencyDelta)}% from baseline`
      : latencyDelta >= WARNING_LATENCY_INCREASE
        ? `WARNING: Latency increased ${Math.round(latencyDelta)}% from baseline`
        : 'Latency within acceptable range',
  });

  // Cache regression
  const cacheDelta = (baseline.cacheHitRatio - current.cacheHitRatio) * 100;
  if (cacheDelta > 10) {
    checks.push({
      metric: 'cacheHitRatio',
      baseline: baseline.cacheHitRatio,
      current: current.cacheHitRatio,
      deltaPercent: Math.round(cacheDelta * 10) / 10,
      severity: 'warning',
      message: `WARNING: Cache hit ratio decreased by ${Math.round(cacheDelta)}%`,
    });
  }

  // Validation regression
  const validationRate = current.totalCalls > 0 ? current.validationFailures / current.totalCalls : 0;
  const validationDelta = (validationRate - baseline.validationFailureRate) * 100;
  if (validationDelta > 5) {
    checks.push({
      metric: 'validationFailureRate',
      baseline: baseline.validationFailureRate,
      current: validationRate,
      deltaPercent: Math.round(validationDelta * 10) / 10,
      severity: validationDelta > 15 ? 'critical' : 'warning',
      message: `Validation failure rate increased by ${Math.round(validationDelta)}%`,
    });
  }

  const hasRegressions = checks.some(c => c.severity !== 'none');
  const criticalCount = checks.filter(c => c.severity === 'critical').length;
  const warningCount = checks.filter(c => c.severity === 'warning').length;

  return {
    timestamp: new Date().toISOString(),
    hasRegressions,
    checks,
    summary: hasRegressions
      ? `${criticalCount} critical, ${warningCount} warning regression(s) detected`
      : 'No regressions detected',
  };
}

/** Convenience: capture baseline, then run regression check */
export function runRegressionCheck(): RegressionReport {
  if (!getPerformanceBaseline()) {
    capturePerformanceBaseline();
    return {
      timestamp: new Date().toISOString(),
      hasRegressions: false,
      checks: [],
      summary: 'Initial baseline captured. Run again after more traffic to detect regressions.',
    };
  }
  return detectRegressions();
}
