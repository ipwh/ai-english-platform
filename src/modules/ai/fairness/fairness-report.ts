// ============================================
// Sprint 112: Fairness Report
// Markdown and JSON reports.
// ============================================

import type { FairnessResult } from './fairness-types';
import { getFairnessMetrics } from './fairness-metrics';

export interface FairnessReport {
  metrics: ReturnType<typeof getFairnessMetrics>;
  generatedAt: string;
}

export function generateFairnessReport(lastResult?: FairnessResult): FairnessReport & { lastResult?: FairnessResult } {
  return {
    metrics: getFairnessMetrics(),
    lastResult,
    generatedAt: new Date().toISOString(),
  };
}

export function formatFairnessReport(report?: FairnessReport & { lastResult?: FairnessResult }): string {
  const r = report || generateFairnessReport();
  const lines: string[] = [];

  lines.push('# ⚖️ Grading Fairness Report');
  lines.push(`> Generated: ${r.generatedAt}`);
  lines.push('');

  lines.push('## Summary');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Evaluations | ${r.metrics.totalEvaluations} |`);
  lines.push(`| Avg Score | ${r.metrics.avgScore}/100 |`);
  lines.push(`| Avg Confidence | ${r.metrics.avgConfidence} |`);
  lines.push(`| Correct | ${r.metrics.correctRate}% |`);
  lines.push(`| Accept | ${r.metrics.acceptRate}% |`);
  lines.push(`| Partially Correct | ${r.metrics.partialRate}% |`);
  lines.push(`| Incorrect | ${r.metrics.incorrectRate}% |`);
  lines.push(`| False Negative Reduction | ${r.metrics.falseNegativeReduction}% |`);
  lines.push(`| Partial Credit Frequency | ${r.metrics.partialCreditFrequency}% |`);
  lines.push('');

  if (r.metrics.mostTriggeredRule) {
    lines.push(`### Most Triggered Rule: \`${r.metrics.mostTriggeredRule.ruleId}\` (${r.metrics.mostTriggeredRule.failures} triggers)`);
    lines.push('');
  }

  if (r.metrics.ruleStatistics.length > 0) {
    lines.push('## Rule Statistics');
    lines.push('| Rule ID | Executions | Failures | Failure Rate |');
    lines.push('|---------|------------|----------|--------------|');
    for (const rule of r.metrics.ruleStatistics.slice(0, 14)) {
      lines.push(`| ${rule.ruleId} | ${rule.executions} | ${rule.failures} | ${rule.failureRate} |`);
    }
    lines.push('');
  }

  if (r.lastResult) {
    lines.push('## Last Evaluation');
    lines.push(`- **Decision**: ${r.lastResult.decision}`);
    lines.push(`- **Score**: ${r.lastResult.score}/100`);
    lines.push(`- **Confidence**: ${Math.round(r.lastResult.confidence * 100)}%`);
    lines.push(`- **Partial Credit**: ${Math.round(r.lastResult.partialCredit * 100)}%`);
    lines.push(`- **Normalized Answer**: \`${r.lastResult.normalizedAnswer}\``);
    lines.push(`- **Normalized Reference**: \`${r.lastResult.normalizedReference}\``);
    lines.push('');
    lines.push('### Dimensions');
    lines.push(`| Dimension | Score |`);
    lines.push(`|-----------|-------|`);
    for (const [dim, score] of Object.entries(r.lastResult.dimensions)) {
      lines.push(`| ${dim} | ${score} |`);
    }
  }

  return lines.join('\n');
}

export function formatFairnessReportJson(report?: FairnessReport & { lastResult?: FairnessResult }): string {
  return JSON.stringify(report || generateFairnessReport(), null, 2);
}
