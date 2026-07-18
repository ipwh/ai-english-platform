// Sprint 17: Health Report — combined observability snapshot
import { getAllMetrics, getHistogram } from './metrics';
import { getCompletedSpans, getActiveSpans } from './tracer';
import { getAiLatencySummary } from './latency-monitor';
import { getTopErrors, getErrorCountBySource, getTotalErrors } from './error-monitor';

export interface HealthReport {
  timestamp: Date;
  metrics: { counters: number; histograms: number; gauges: number };
  tracing: { completedSpans: number; activeSpans: number };
  latency: { ai: Record<string, { count: number; avgMs: number; p95Ms: number }> };
  errors: { total: number; bySource: Record<string, number>; top: Array<{ message: string; count: number }> };
  status: 'healthy' | 'degraded' | 'unhealthy';
}

export function generateHealthReport(): HealthReport {
  const metrics = getAllMetrics();
  const latency = getAiLatencySummary();
  const errors = {
    total: getTotalErrors(),
    bySource: getErrorCountBySource(),
    top: getTopErrors(5).map(e => ({ message: e.message, count: e.count })),
  };

  // Determine health status
  let status: HealthReport['status'] = 'healthy';
  const highErrorRate = Object.values(latency.byModel).some(m => m.errorRate > 0.1);
  const tooManyErrors = errors.total > 50;
  if (highErrorRate && tooManyErrors) status = 'unhealthy';
  else if (highErrorRate || tooManyErrors) status = 'degraded';

  return {
    timestamp: new Date(),
    metrics: {
      counters: metrics.filter(m => m.type === 'counter').length,
      histograms: metrics.filter(m => m.type === 'histogram').length,
      gauges: metrics.filter(m => m.type === 'gauge').length,
    },
    tracing: {
      completedSpans: getCompletedSpans().length,
      activeSpans: getActiveSpans().length,
    },
    latency: {
      ai: Object.fromEntries(
        Object.entries(latency.byModel).map(([k, v]) => [k, { count: v.count, avgMs: v.avgMs, p95Ms: v.p95Ms }])
      ),
    },
    errors,
    status,
  };
}

/** Format health report as readable text */
export function formatHealthReport(report: HealthReport): string {
  const lines: string[] = [
    '═══════════════════════════════════════',
    `  Health Report — ${report.status.toUpperCase()}`,
    `  ${report.timestamp.toISOString()}`,
    '═══════════════════════════════════════',
    '',
    '--- Metrics ---',
    `  Counters: ${report.metrics.counters}, Histograms: ${report.metrics.histograms}, Gauges: ${report.metrics.gauges}`,
    '',
    '--- Tracing ---',
    `  Active spans: ${report.tracing.activeSpans}, Completed: ${report.tracing.completedSpans}`,
    '',
    '--- AI Latency ---',
  ];

  for (const [model, data] of Object.entries(report.latency.ai)) {
    lines.push(`  ${model}: ${data.count} calls, avg=${data.avgMs}ms, p95=${data.p95Ms}ms`);
  }

  lines.push('', '--- Errors ---', `  Total: ${report.errors.total}`);
  for (const [source, count] of Object.entries(report.errors.bySource)) {
    lines.push(`  ${source}: ${count}`);
  }
  if (report.errors.top.length > 0) {
    lines.push('  Top errors:');
    for (const e of report.errors.top) {
      lines.push(`    [${e.count}x] ${e.message.slice(0, 80)}`);
    }
  }

  lines.push('', '═══════════════════════════════════════');
  return lines.join('\n');
}
