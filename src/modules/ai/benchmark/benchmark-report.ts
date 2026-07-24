// Sprint 96: Benchmark Report — generates Markdown summaries from benchmark suites
import type { BenchmarkSuite, BenchmarkResult } from './benchmark-types';

export function generateMarkdownReport(suite: BenchmarkSuite): string {
  const lines: string[] = [
    `# AI Benchmark Report: ${suite.suiteName}`,
    '',
    `- **Started**: ${suite.startedAt}`,
    `- **Completed**: ${suite.completedAt || 'N/A'}`,
    `- **Total Runs**: ${suite.summary.totalRuns}`,
    `- **Total Failures**: ${suite.summary.totalFailures}`,
    `- **Overall P50**: ${suite.summary.overallP50Ms}ms`,
    `- **Overall P95**: ${suite.summary.overallP95Ms}ms`,
    '',
    '## Scenario Comparison',
    '',
    '| Scenario | Avg Latency | Success Rate |',
    '|----------|------------|--------------|',
  ];

  for (const [name, comp] of Object.entries(suite.summary.scenarioComparison)) {
    lines.push(`| ${name} | ${comp.avgMs}ms | ${(comp.successRate * 100).toFixed(0)}% |`);
  }

  lines.push('', '## Provider Comparison', '', '| Provider | Calls | Avg Latency | Fallback Rate |', '|----------|-------|-------------|---------------|');
  for (const [name, comp] of Object.entries(suite.summary.providerComparison)) {
    lines.push(`| ${name} | ${comp.calls} | ${comp.avgMs}ms | ${(comp.fallbackRate * 100).toFixed(0)}% |`);
  }

  lines.push('', '## Per-Scenario Details', '');
  for (const result of suite.results) {
    lines.push(`### ${result.scenario}`, '', `- P50: ${result.aggregate.p50LatencyMs}ms`, `- P95: ${result.aggregate.p95LatencyMs}ms`, `- Avg: ${result.aggregate.avgLatencyMs}ms`, `- Success: ${result.aggregate.successCount}/${result.aggregate.count}`, `- Avg Tokens: ${result.aggregate.avgTokens.total}`, `- Retries: ${result.aggregate.totalRetries}`, '');
  }

  return lines.join('\n');
}

export function generateJsonReport(suite: BenchmarkSuite): string {
  return JSON.stringify(suite, null, 2);
}
