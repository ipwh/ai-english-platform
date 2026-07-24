// ============================================
// Sprint 115: Human Review Engine
// Simulates a human teacher's final quality check.
// ============================================

import type { HumanReviewResult, HumanReviewCheck, HumanReviewContext } from './human-review-types';
import { calculateHumanReviewScore, determineHumanReviewDecision, createHumanReviewDimensions } from './human-review-types';
import { initHumanReviewRegistry, getRulesByPriority } from './human-review-registry';
import { recordHumanReview, recordRuleExecution } from './human-review-metrics';

export function humanReview(
  questions: Record<string, unknown>[],
  context?: HumanReviewContext,
): HumanReviewResult {
  const start = Date.now();

  initHumanReviewRegistry();
  const rules = getRulesByPriority();

  if (!questions || questions.length === 0) {
    return {
      decision: 'excellent',
      dimensions: { ...createHumanReviewDimensions(), overall: 100 },
      score: 100, checks: [], topIssues: [], recommendations: [], warnings: [],
      metadata: { totalChecks: 0, passed: 0, failed: 0, questionCount: 0, durationMs: Date.now() - start },
    };
  }

  const allChecks: HumanReviewCheck[] = [];

  for (const rule of rules) {
    const checks = rule.review(questions, context);
    allChecks.push(...checks);
    const failed = checks.filter((c: HumanReviewCheck) => !c.passed).length;
    recordRuleExecution(rule.id, failed > 0, checks.length);
  }

  const dims = createHumanReviewDimensions();
  const failedChecks = allChecks.filter(c => !c.passed);

  for (const check of failedChecks) {
    const penalty = (1 - check.score) * 100;
    switch (check.ruleId) {
      case 'hr:ambiguity':
      case 'hr:option-fairness':
        dims.fairness = Math.max(0, dims.fairness - penalty);
        break;
      case 'hr:distractor-naturalness':
      case 'hr:wording-naturalness':
      case 'hr:reading-naturalness':
      case 'hr:listening-naturalness':
        dims.naturalness = Math.max(0, dims.naturalness - penalty);
        break;
      case 'hr:explanation-quality':
        dims.teachingValue = Math.max(0, dims.teachingValue - penalty);
        break;
      case 'hr:question-flow':
      case 'hr:integrated-skills-flow':
        dims.studentExperience = Math.max(0, dims.studentExperience - penalty);
        break;
      case 'hr:answer-support':
        dims.confidence = Math.max(0, dims.confidence - penalty);
        break;
      case 'hr:writing-authenticity':
        dims.authenticity = Math.max(0, dims.authenticity - penalty);
        break;
      case 'hr:student-confusion':
        dims.studentExperience = Math.max(0, dims.studentExperience - penalty);
        dims.naturalness = Math.max(0, dims.naturalness - penalty * 0.5);
        break;
    }
  }

  const dimensions = calculateHumanReviewScore(dims);
  const decision = determineHumanReviewDecision(dimensions.overall);

  const topIssues = failedChecks
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map(c => `[Q${c.questionIndex + 1}] ${c.detail || c.ruleId}`);

  const recommendations = failedChecks
    .filter(c => c.suggestion)
    .slice(0, 5)
    .map(c => c.suggestion!);

  const warnings = failedChecks
    .filter(c => c.priority === 'high' || c.priority === 'critical')
    .map(c => `[${c.ruleId}] ${c.detail || ''}`);

  const result: HumanReviewResult = {
    decision, dimensions, score: dimensions.overall, checks: allChecks,
    topIssues, recommendations, warnings,
    metadata: {
      totalChecks: allChecks.length,
      passed: allChecks.filter(c => c.passed).length,
      failed: failedChecks.length,
      questionCount: questions.length,
      durationMs: Date.now() - start,
    },
  };

  recordHumanReview(result);
  return result;
}
