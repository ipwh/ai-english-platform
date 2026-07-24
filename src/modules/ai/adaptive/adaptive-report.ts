// ============================================
// Sprint 114: Adaptive Report
// ============================================

import type { AdaptiveResult, StudentProfile } from './adaptive-types';
import { getAdaptiveMetrics } from './adaptive-metrics';

export interface AdaptiveReport {
  metrics: ReturnType<typeof getAdaptiveMetrics>;
  generatedAt: string;
}

export function generateAdaptiveReport(lastResult?: AdaptiveResult, profile?: StudentProfile): AdaptiveReport & { lastResult?: AdaptiveResult; profile?: StudentProfile } {
  return { metrics: getAdaptiveMetrics(), lastResult, profile, generatedAt: new Date().toISOString() };
}

export function formatAdaptiveReport(report?: AdaptiveReport & { lastResult?: AdaptiveResult; profile?: StudentProfile }): string {
  const r = report || generateAdaptiveReport();
  const lines: string[] = [];
  lines.push('# 🧠 Adaptive Learning Report');
  lines.push(`> Generated: ${r.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Evaluations | ${r.metrics.totalEvaluations} |`);
  lines.push(`| Avg Score | ${r.metrics.avgScore}/100 |`);
  lines.push(`| Excellent | ${r.metrics.excellentRate}% |`);
  lines.push(`| Good | ${r.metrics.goodRate}% |`);
  lines.push(`| Acceptable | ${r.metrics.acceptableRate}% |`);
  lines.push(`| Needs Adjustment | ${r.metrics.needsAdjustmentRate}% |`);
  lines.push('');

  lines.push('### Recommendations');
  lines.push(`- Review: ${r.metrics.recommendationDistribution.review}%`);
  lines.push(`- Practice: ${r.metrics.recommendationDistribution.practice}%`);
  lines.push(`- Advance: ${r.metrics.recommendationDistribution.advance}%`);
  lines.push(`- Revision: ${r.metrics.recommendationDistribution.revision}%`);
  lines.push('');

  if (r.metrics.ruleStatistics.length > 0) {
    lines.push('## Rule Statistics');
    lines.push('| Rule ID | Executions | Failures |');
    lines.push('|---------|------------|----------|');
    for (const rule of r.metrics.ruleStatistics.slice(0, 12)) {
      lines.push(`| ${rule.ruleId} | ${rule.executions} | ${rule.failures} |`);
    }
    lines.push('');
  }

  if (r.lastResult) {
    lines.push('## Last Evaluation');
    lines.push(`- **Decision**: ${r.lastResult.decision}`);
    lines.push(`- **Score**: ${r.lastResult.score}/100`);
    lines.push(`- **Adjusted Difficulty**: ${r.lastResult.adjustedDifficulty}`);
    lines.push(`- **Focus Skills**: ${r.lastResult.focusSkills.join(', ') || 'none'}`);
    lines.push(`- **Recommendations**: ${r.lastResult.recommendations.join(', ')}`);
    lines.push('');
    lines.push('### Dimensions');
    for (const [dim, score] of Object.entries(r.lastResult.dimensions)) {
      lines.push(`- ${dim}: ${score}`);
    }
  }

  return lines.join('\n');
}

export function formatAdaptiveReportJson(report?: AdaptiveReport): string {
  return JSON.stringify(report || generateAdaptiveReport(), null, 2);
}
