// ============================================
// Sprint 111: Calibration Report
// Markdown and JSON reports.
// ============================================

import type { CalibrationResult } from './calibration-types';
import { getCalibrationMetrics } from './calibration-metrics';

export interface CalibrationReport {
  metrics: ReturnType<typeof getCalibrationMetrics>;
  generatedAt: string;
}

/** Generate a calibration report */
export function generateCalibrationReport(lastResult?: CalibrationResult): CalibrationReport & { lastResult?: CalibrationResult } {
  return {
    metrics: getCalibrationMetrics(),
    lastResult,
    generatedAt: new Date().toISOString(),
  };
}

/** Format report as Markdown */
export function formatCalibrationReport(report?: CalibrationReport & { lastResult?: CalibrationResult }): string {
  const r = report || generateCalibrationReport();
  const lines: string[] = [];

  lines.push('# 📐 Output Calibration Report');
  lines.push(`> Generated: ${r.generatedAt}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Calibrations | ${r.metrics.totalCalibrations} |`);
  lines.push(`| Total Questions | ${r.metrics.totalQuestions} |`);
  lines.push(`| Avg Calibration Score | ${r.metrics.avgCalibrationScore}/100 |`);
  lines.push(`| Total Changes | ${r.metrics.totalChanges} |`);
  lines.push(`| Improvement Rate | ${r.metrics.improvementRate}% |`);
  lines.push('');

  // Most Common Rule
  if (r.metrics.mostCommonRule) {
    lines.push(`### Most Common Rule: \`${r.metrics.mostCommonRule.ruleId}\` (${r.metrics.mostCommonRule.failures} failures)`);
    lines.push('');
  }

  // Rule Statistics
  if (r.metrics.ruleStatistics.length > 0) {
    lines.push('## Rule Statistics');
    lines.push('| Rule ID | Executions | Failures | Failure Rate |');
    lines.push('|---------|------------|----------|--------------|');
    for (const rule of r.metrics.ruleStatistics.slice(0, 11)) {
      lines.push(`| ${rule.ruleId} | ${rule.executions} | ${rule.failures} | ${rule.failureRate} |`);
    }
    lines.push('');
  }

  // Last Result
  if (r.lastResult) {
    lines.push('## Last Calibration Result');
    lines.push(`- **Decision**: ${r.lastResult.decision}`);
    lines.push(`- **Score**: ${r.lastResult.score}/100`);
    lines.push(`- **Modified**: ${r.lastResult.modifiedCount}/${r.lastResult.metadata.questionCount} questions`);
    lines.push(`- **Total Changes**: ${r.lastResult.totalChanges}`);
    lines.push('');
    lines.push('### Dimensions');
    lines.push(`| Dimension | Score |`);
    lines.push(`|-----------|-------|`);
    for (const [dim, score] of Object.entries(r.lastResult.dimensions)) {
      lines.push(`| ${dim} | ${score} |`);
    }
    lines.push('');

    if (r.lastResult.warnings.length > 0) {
      lines.push('### Warnings');
      for (const w of r.lastResult.warnings.slice(0, 10)) {
        lines.push(`- ${w}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/** Format report as JSON */
export function formatCalibrationReportJson(report?: CalibrationReport & { lastResult?: CalibrationResult }): string {
  return JSON.stringify(report || generateCalibrationReport(), null, 2);
}
