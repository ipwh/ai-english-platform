// ============================================
// Benchmark Report — result formatting
// Used by: scripts/benchmark-ai.ts (CLI tool)
// Classification: TOOLING — developer benchmarking infrastructure
// ============================================

import type { BenchmarkReport } from './benchmark-types';

export function generateMarkdownReport(report: BenchmarkReport): string {
  const lines: string[] = [
    `# AI Benchmark Report`,
    `**Generated**: ${report.timestamp}`,
    `**Scenarios**: ${report.totalScenarios}`,
    '',
    '| Scenario | Category | Avg (ms) | P95 (ms) | Success Rate |',
    '|----------|----------|----------|----------|-------------|',
  ];

  for (const r of report.results) {
    const rate = r.iterations > 0
      ? `${Math.round((r.successCount / r.iterations) * 100)}%`
      : 'N/A';
    lines.push(
      `| ${r.scenario} | ${r.category} | ${r.avgDurationMs.toFixed(1)} | ${r.p95Ms.toFixed(1)} | ${rate} |`,
    );
  }

  lines.push(
    '',
    `**Overall Success Rate**: ${(report.summary.overallSuccessRate * 100).toFixed(1)}%`,
    `**Total Duration**: ${report.summary.totalDurationMs}ms`,
  );

  return lines.join('\n');
}

export function generateJsonReport(report: BenchmarkReport): string {
  return JSON.stringify(report, null, 2);
}
