// Sprint 97: Load Test Report — generates Markdown/JSON reports
import type { LoadSuite } from './load-test-types';

export function generateLoadMarkdownReport(suite: LoadSuite): string {
  const lines = [
    `# Load Test Report: ${suite.suiteName}`,
    '', `- **Started**: ${suite.startedAt}`, `- **Completed**: ${suite.completedAt || 'N/A'}`,
    `- **Total Requests**: ${suite.summary.totalRequests}`,
    `- **Failures**: ${suite.summary.totalFailures}`,
    `- **Success Rate**: ${(suite.summary.overallSuccessRate * 100).toFixed(1)}%`,
    `- **Overall P95**: ${suite.summary.overallP95Ms}ms`,
    `- **Max Concurrency**: ${suite.summary.maxConcurrency}`,
    `- **Avg Throughput**: ${suite.summary.avgThroughput} req/s`,
    '', '## Scenario Results', '',
    '| Scenario | Pattern | Concurrency | Requests | Success Rate | P95 | Avg | Throughput |',
    '|----------|---------|-------------|----------|-------------|-----|-----|------------|',
  ];
  for (const r of suite.results) {
    lines.push(`| ${r.scenario} | ${r.pattern} | ${r.concurrency} | ${r.totalRequests} | ${(r.successRate * 100).toFixed(0)}% | ${r.latency.p95}ms | ${r.latency.avg}ms | ${r.throughput.requestsPerSecond}/s |`);
  }
  lines.push('', '## Provider Utilization', '', '| Provider | Calls | Avg Latency | Fallbacks |', '|----------|-------|-------------|-----------|');
  for (const r of suite.results) {
    for (const [name, stats] of Object.entries(r.providerUtilization)) {
      lines.push(`| ${name} | ${stats.calls} | ${stats.avgLatencyMs}ms | ${stats.fallbackCount} |`);
    }
  }
  lines.push('', '## Memory', '', '| Scenario | Before (MB) | After (MB) | Delta (MB) |', '|----------|-------------|------------|------------|');
  for (const r of suite.results) {
    lines.push(`| ${r.scenario} | ${r.memory.beforeMB} | ${r.memory.afterMB} | ${r.memory.deltaMB > 0 ? '+' : ''}${r.memory.deltaMB} |`);
  }
  return lines.join('\n');
}

export function generateLoadJsonReport(suite: LoadSuite): string {
  return JSON.stringify(suite, null, 2);
}
