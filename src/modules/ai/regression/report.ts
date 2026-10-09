// ============================================
// Markdown Report Generator
//
// Generates human-readable regression reports.
// ============================================

import type { RegressionReport } from './types';

/**
 * Generate a Markdown report from regression results.
 */
export function generateMarkdownReport(report: RegressionReport): string {
  const { summary, results, worstRegressions, removedCapabilities } = report;

  const lines: string[] = [];

  lines.push('# Prompt Regression Report');
  lines.push('');
  lines.push(`**Generated**: ${summary.evaluatedAt}`);
  lines.push(`**Provider**: ${summary.provider}`);
  lines.push(`**Fixtures**: ${summary.totalFixtures} | **Passed**: ${summary.passed} | **Failed**: ${summary.failed}`);
  lines.push('');

  // Overall score with delta
  const deltaStr = summary.scoreDelta !== undefined
    ? ` (${summary.scoreDelta >= 0 ? '+' : ''}${summary.scoreDelta} vs previous)`
    : '';
  lines.push(`## Overall Score: **${summary.overallScore}**/100${deltaStr}`);
  lines.push('');

  // Threshold check
  lines.push('### Pass/Fail Thresholds');
  lines.push(`| Rule | Threshold | Status |`);
  lines.push(`|------|-----------|--------|`);
  const overallPass = summary.failed === 0;
  lines.push(`| Overall | All fixtures pass | ${overallPass ? '✅' : '❌'} |`);
  lines.push(`| Structural | 100% structural checks | ${summary.failed === 0 ? '✅' : '❌'} |`);
  lines.push(`| Semantic | ≥ 90 semantic score | ${results.every(r => r.scores.semantic.score >= 90) ? '✅' : '❌'} |`);
  lines.push('');

  // Latency and tokens
  lines.push('### Resource Usage');
  lines.push(`- Total latency: ${summary.totalLatencyMs}ms`);
  lines.push(`- Estimated tokens: ${Math.round(summary.totalTokensUsed)}`);
  lines.push('');

  // Per-fixture results
  lines.push('## Per-Fixture Results');
  lines.push('');
  lines.push('| Fixture | Overall | Rubric | Semantic | Structural | Pass |');
  lines.push('|---------|---------|--------|----------|------------|------|');
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    lines.push(`| ${r.fixtureId} | ${r.scores.overall} | ${r.scores.rubric.score} | ${r.scores.semantic.score} | ${r.scores.structural.score} | ${icon} |`);
  }
  lines.push('');

  // Average scores
  const avgRubric = avg(results.map(r => r.scores.rubric.score));
  const avgSemantic = avg(results.map(r => r.scores.semantic.score));
  const avgStructural = avg(results.map(r => r.scores.structural.score));
  lines.push('### Average Scores');
  lines.push(`| Dimension | Average |`);
  lines.push(`|-----------|---------|`);
  lines.push(`| Rubric | ${avgRubric} |`);
  lines.push(`| Semantic | ${avgSemantic} |`);
  lines.push(`| Structural | ${avgStructural} |`);
  lines.push('');

  // Worst regressions
  if (worstRegressions.length > 0) {
    lines.push('## Worst Regressions');
    lines.push('');
    for (const r of worstRegressions) {
      lines.push(`### ${r.fixtureId} — Score: ${r.scores.overall}`);
      if (r.failures.length > 0) {
        for (const f of r.failures) {
          lines.push(`- ❌ **${f.dimension}/${f.check}**: ${f.message}`);
        }
      }
      lines.push('');
    }
  }

  // Removed capabilities
  if (removedCapabilities.length > 0) {
    lines.push('## ⚠️ Removed Capabilities');
    lines.push('');
    lines.push('These fixtures passed previously but now fail:');
    lines.push('');
    for (const r of removedCapabilities) {
      lines.push(`- **${r.fixtureId}** (score: ${r.scores.overall})`);
    }
    lines.push('');
  }

  // Detailed failure breakdown
  const allFailures = results.flatMap(r => r.failures);
  if (allFailures.length > 0) {
    lines.push('## Failure Breakdown');
    lines.push('');
    const byDimension = groupBy(allFailures, f => f.dimension);
    for (const [dim, dimFailures] of Object.entries(byDimension)) {
      lines.push(`### ${dim} (${dimFailures.length} failures)`);
      const byCheck = groupBy(dimFailures, f => f.check);
      for (const [check, checkFailures] of Object.entries(byCheck)) {
        lines.push(`- **${check}**: ${checkFailures.length} fixture(s)`);
      }
      lines.push('');
    }
  }

  // Summary verdict
  lines.push('## Verdict');
  if (summary.failed === 0) {
    lines.push('✅ **ALL CHECKS PASSED** — prompt changes are safe to merge.');
  } else {
    lines.push(`❌ **${summary.failed} FIXTURE(S) FAILED** — regression detected. Review before merging.`);
  }

  return lines.join('\n');
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}
