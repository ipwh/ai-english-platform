// ============================================
// Sprint 113: Question Quality Report
// ============================================

import type { QuestionQualityResult } from './question-quality-types';
import { getQuestionQualityMetrics } from './question-quality-metrics';

export interface QuestionQualityReport {
  metrics: ReturnType<typeof getQuestionQualityMetrics>;
  generatedAt: string;
}

export function generateQuestionQualityReport(lastResult?: QuestionQualityResult): QuestionQualityReport & { lastResult?: QuestionQualityResult } {
  return { metrics: getQuestionQualityMetrics(), lastResult, generatedAt: new Date().toISOString() };
}

export function formatQuestionQualityReport(report?: QuestionQualityReport & { lastResult?: QuestionQualityResult }): string {
  const r = report || generateQuestionQualityReport();
  const lines: string[] = [];

  lines.push('# 📋 Question Quality Report');
  lines.push(`> Generated: ${r.generatedAt}`);
  lines.push('');

  lines.push('## Summary');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Evaluations | ${r.metrics.totalEvaluations} |`);
  lines.push(`| Total Questions | ${r.metrics.totalQuestions} |`);
  lines.push(`| Avg Score | ${r.metrics.avgScore}/100 |`);
  lines.push(`| Excellent | ${r.metrics.excellentRate}% |`);
  lines.push(`| Good | ${r.metrics.goodRate}% |`);
  lines.push(`| Acceptable | ${r.metrics.acceptableRate}% |`);
  lines.push(`| Needs Improvement | ${r.metrics.needsImprovementRate}% |`);
  lines.push(`| Distractor Failures | ${r.metrics.distractorFailures} |`);
  lines.push(`| Ambiguous Questions | ${r.metrics.ambiguousQuestions} |`);
  lines.push(`| Repeated Templates | ${r.metrics.repeatedTemplates} |`);
  lines.push('');

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
    lines.push(`- **Questions**: ${r.lastResult.metadata.questionCount}`);
    lines.push(`- **Passed/Failed**: ${r.lastResult.metadata.passed}/${r.lastResult.metadata.failed}`);
    lines.push('');
    lines.push('### Dimensions');
    lines.push(`| Dimension | Score |`);
    lines.push(`|-----------|-------|`);
    for (const [dim, score] of Object.entries(r.lastResult.dimensions)) {
      lines.push(`| ${dim} | ${score} |`);
    }
    if (r.lastResult.recommendations.length > 0) {
      lines.push('');
      lines.push('### Recommendations');
      for (const rec of r.lastResult.recommendations.slice(0, 5)) {
        lines.push(`- ${rec}`);
      }
    }
  }

  return lines.join('\n');
}

export function formatQuestionQualityReportJson(report?: QuestionQualityReport & { lastResult?: QuestionQualityResult }): string {
  return JSON.stringify(report || generateQuestionQualityReport(), null, 2);
}
