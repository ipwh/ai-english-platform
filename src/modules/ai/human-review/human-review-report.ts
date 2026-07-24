// ============================================
// Sprint 115: Human Review Report
// ============================================

import type { HumanReviewResult } from './human-review-types';
import { getHumanReviewMetrics } from './human-review-metrics';

export interface HumanReviewReport {
  metrics: ReturnType<typeof getHumanReviewMetrics>;
  generatedAt: string;
}

export function generateHumanReviewReport(lastResult?: HumanReviewResult): HumanReviewReport & { lastResult?: HumanReviewResult } {
  return { metrics: getHumanReviewMetrics(), lastResult, generatedAt: new Date().toISOString() };
}

export function formatHumanReviewReport(report?: HumanReviewReport & { lastResult?: HumanReviewResult }): string {
  const r = report || generateHumanReviewReport();
  const lines: string[] = [];
  lines.push('# 👩‍🏫 Human Review Report');
  lines.push(`> Generated: ${r.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Reviews | ${r.metrics.totalReviews} |`);
  lines.push(`| Avg Score | ${r.metrics.avgScore}/100 |`);
  lines.push(`| Pass Rate | ${r.metrics.passRate}% |`);
  lines.push(`| Excellent | ${r.metrics.excellentRate}% |`);
  lines.push(`| Good | ${r.metrics.goodRate}% |`);
  lines.push(`| Acceptable | ${r.metrics.acceptableRate}% |`);
  lines.push(`| Needs Improvement | ${r.metrics.needsImprovementRate}% |`);
  lines.push(`| Reject | ${r.metrics.rejectRate}% |`);
  lines.push(`| Avg Latency | ${r.metrics.avgLatencyMs}ms |`);
  lines.push('');

  if (r.metrics.topIssues.length > 0) {
    lines.push('## Top Issues');
    for (const issue of r.metrics.topIssues) {
      lines.push(`- **${issue.ruleId}**: ${issue.failures} failures`);
    }
    lines.push('');
  }

  if (r.lastResult) {
    lines.push('## Last Review');
    lines.push(`- **Decision**: ${r.lastResult.decision}`);
    lines.push(`- **Score**: ${r.lastResult.score}/100`);
    lines.push(`- **Questions**: ${r.lastResult.metadata.questionCount}`);
    lines.push('');
    lines.push('### Dimensions');
    for (const [dim, score] of Object.entries(r.lastResult.dimensions)) {
      lines.push(`- ${dim}: ${score}`);
    }
    if (r.lastResult.topIssues.length > 0) {
      lines.push('');
      lines.push('### Top Issues');
      for (const issue of r.lastResult.topIssues) lines.push(`- ${issue}`);
    }
    if (r.lastResult.recommendations.length > 0) {
      lines.push('');
      lines.push('### Recommendations');
      for (const rec of r.lastResult.recommendations) lines.push(`- ${rec}`);
    }
  }

  return lines.join('\n');
}

export function formatHumanReviewReportJson(report?: HumanReviewReport): string {
  return JSON.stringify(report || generateHumanReviewReport(), null, 2);
}
