// ============================================
// Sprint 110: Feedback Report
// Generates markdown and JSON reports.
// ============================================

import { getFeedbackMetrics } from './feedback-metrics';
import { getFeedbackHistory } from './feedback-history';
import { getKnowledgeState, getAllKnowledge } from './feedback-knowledge';
import { detectPatterns } from './feedback-pattern';
import { getLearningHistory, runLearningCycle } from './feedback-learning';
import { getDynamicConstraints } from './feedback-knowledge';
import type { FeedbackSummary } from './feedback-types';

// ═══ Report Types ═══

export interface FeedbackReport {
  summary: FeedbackSummary;
  patterns: ReturnType<typeof detectPatterns>;
  knowledge: ReturnType<typeof getKnowledgeState>;
  learning: {
    events: ReturnType<typeof getLearningHistory>;
    totalEvents: number;
  };
  constraints: ReturnType<typeof getDynamicConstraints>;
  metrics: ReturnType<typeof getFeedbackMetrics>;
  generatedAt: string;
}

// ═══ Generate Reports ═══

/** Generate a full feedback report */
export function generateFeedbackReport(): FeedbackReport {
  const events = getFeedbackHistory();
  const bySource = {} as Record<string, number>;
  const byCategory = {} as Record<string, number>;
  const bySeverity = {} as Record<string, number>;
  const ruleCounts = new Map<string, number>();

  let totalScore = 0;
  let scoreCount = 0;
  let repairableCount = 0;

  for (const e of events) {
    bySource[e.source] = (bySource[e.source] || 0) + 1;
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
    ruleCounts.set(e.rule, (ruleCounts.get(e.rule) || 0) + 1);
    if (e.score !== undefined) { totalScore += e.score; scoreCount++; }
    if (e.repairable) repairableCount++;
  }

  const summary: FeedbackSummary = {
    totalEvents: events.length,
    bySource: bySource as FeedbackSummary['bySource'],
    byCategory: byCategory as FeedbackSummary['byCategory'],
    bySeverity: bySeverity as FeedbackSummary['bySeverity'],
    topFailingRules: Array.from(ruleCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([rule, count]) => ({ rule, count })),
    averageScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
    repairRate: events.length > 0 ? Math.round((repairableCount / events.length) * 100) : 0,
    timestamp: new Date().toISOString(),
  };

  return {
    summary,
    patterns: detectPatterns(),
    knowledge: getKnowledgeState(),
    learning: {
      events: getLearningHistory(50),
      totalEvents: getLearningHistory().length,
    },
    constraints: getDynamicConstraints(),
    metrics: getFeedbackMetrics(),
    generatedAt: new Date().toISOString(),
  };
}

// ═══ Format Reports ═══

/** Format report as Markdown */
export function formatFeedbackReport(report?: FeedbackReport): string {
  const r = report || generateFeedbackReport();
  const lines: string[] = [];

  lines.push('# 📊 Feedback Report');
  lines.push(`> Generated: ${r.generatedAt}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Events | ${r.summary.totalEvents} |`);
  lines.push(`| Average Score | ${r.summary.averageScore} |`);
  lines.push(`| Repair Rate | ${r.summary.repairRate}% |`);
  lines.push('');

  // By Source
  lines.push('### Events by Source');
  lines.push('| Source | Count |');
  lines.push('|--------|-------|');
  for (const [source, count] of Object.entries(r.summary.bySource)) {
    if (count > 0) lines.push(`| ${source} | ${count} |`);
  }
  lines.push('');

  // Top Failing Rules
  if (r.summary.topFailingRules.length > 0) {
    lines.push('### Top Failing Rules');
    lines.push('| Rule | Failures |');
    lines.push('|------|----------|');
    for (const { rule, count } of r.summary.topFailingRules) {
      lines.push(`| ${rule} | ${count} |`);
    }
    lines.push('');
  }

  // Patterns
  lines.push('## Detected Patterns');
  if (r.patterns.length === 0) {
    lines.push('_No patterns detected yet._');
  } else {
    for (const p of r.patterns.slice(0, 10)) {
      lines.push(`- **${p.type}** (${Math.round(p.confidence * 100)}% confidence): ${p.suggestedConstraint}`);
    }
  }
  lines.push('');

  // Knowledge
  lines.push('## Knowledge Base');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Items | ${r.knowledge.totalCount} |`);
  lines.push(`| Enabled | ${r.knowledge.enabledCount} |`);
  lines.push(`| Avg Confidence | ${r.knowledge.averageConfidence} |`);
  lines.push(`| Total Activations | ${r.knowledge.totalActivations} |`);
  lines.push('');

  // Dynamic Constraints
  if (r.constraints.length > 0) {
    lines.push('## Active Dynamic Constraints');
    for (const c of r.constraints.slice(0, 10)) {
      lines.push(`- [P${c.priority}] **${c.text}** (confidence: ${Math.round(c.confidence * 100)}%, activations: ${c.activationCount})`);
    }
    lines.push('');
  }

  // Metrics
  lines.push('## Metrics');
  lines.push(`- Learning Cycles: ${r.metrics.learningCycles}`);
  lines.push(`- Patterns Detected: ${r.metrics.patternCount}`);
  lines.push(`- Knowledge Items: ${r.metrics.knowledgeCount}`);
  lines.push(`- Prompt Improvement Rate: ${r.metrics.promptImprovementRate}%`);
  lines.push(`- Repair Reduction Rate: ${r.metrics.repairReductionRate}%`);

  return lines.join('\n');
}

/** Format report as JSON string */
export function formatFeedbackReportJson(report?: FeedbackReport): string {
  return JSON.stringify(report || generateFeedbackReport(), null, 2);
}
