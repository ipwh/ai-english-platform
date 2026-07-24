// ============================================
// Sprint 113: Question Quality Engine
// ============================================

import type { QuestionQualityResult, QualityCheck, QualityContext } from './question-quality-types';
import { calculateQualityScore, determineQualityDecision, createQualityDimensions } from './question-quality-types';
import { initQuestionQualityRegistry, getRulesByPriority } from './question-quality-registry';
import { recordQualityEvaluation, recordRuleExecution } from './question-quality-metrics';

export function evaluateQuestionQuality(
  questions: Record<string, unknown>[],
  context?: QualityContext,
): QuestionQualityResult {
  const start = Date.now();

  initQuestionQualityRegistry();
  const rules = getRulesByPriority();

  if (!questions || questions.length === 0) {
    return {
      decision: 'excellent',
      dimensions: { ...createQualityDimensions(), overall: 100 },
      score: 100,
      checks: [],
      warnings: [],
      recommendations: [],
      metadata: { totalChecks: 0, passed: 0, failed: 0, questionCount: 0, durationMs: Date.now() - start },
    };
  }

  const allChecks: QualityCheck[] = [];

  for (const rule of rules) {
    const checks = rule.check(questions, context);
    allChecks.push(...checks);
    const failed = checks.filter((c: QualityCheck) => !c.passed).length;
    recordRuleExecution(rule.id, failed > 0, checks.length);
  }

  const dims = createQualityDimensions();
  const failedChecks = allChecks.filter(c => !c.passed);

  for (const check of failedChecks) {
    const penalty = (1 - check.score) * 100;
    switch (check.ruleId) {
      case 'qq:distractor-plausibility':
      case 'qq:option-similarity':
        dims.distractorQuality = Math.max(0, dims.distractorQuality - penalty);
        break;
      case 'qq:answer-uniqueness':
      case 'qq:stem-completeness':
        dims.questionDesign = Math.max(0, dims.questionDesign - penalty);
        break;
      case 'qq:difficulty-balance':
        dims.difficulty = Math.max(0, dims.difficulty - penalty);
        break;
      case 'qq:question-clarity':
        dims.clarity = Math.max(0, dims.clarity - penalty);
        break;
      case 'qq:reading-evidence':
      case 'qq:listening-evidence':
        dims.evidenceSupport = Math.max(0, dims.evidenceSupport - penalty);
        break;
      case 'qq:writing-prompt-quality':
      case 'qq:integrated-skills':
      case 'qq:vocabulary-level':
      case 'qq:grammar-complexity':
        dims.pedagogy = Math.max(0, dims.pedagogy - penalty);
        break;
      case 'qq:question-variety':
      case 'qq:answer-distribution':
        dims.variety = Math.max(0, dims.variety - penalty);
        break;
    }
  }

  const dimensions = calculateQualityScore(dims);
  const decision = determineQualityDecision(dimensions.overall);

  const warnings = failedChecks
    .filter(c => c.priority === 'high' || c.priority === 'critical')
    .map(c => `[Q${c.questionIndex + 1}] [${c.ruleId}] ${c.detail || 'failed'}`);

  const recommendations = failedChecks
    .filter(c => c.priority === 'medium' || c.priority === 'low')
    .slice(0, 10)
    .map(c => c.detail || '').filter(Boolean);

  const result: QuestionQualityResult = {
    decision,
    dimensions,
    score: dimensions.overall,
    checks: allChecks,
    warnings,
    recommendations,
    metadata: {
      totalChecks: allChecks.length,
      passed: allChecks.filter(c => c.passed).length,
      failed: failedChecks.length,
      questionCount: questions.length,
      durationMs: Date.now() - start,
    },
  };

  recordQualityEvaluation(result);
  return result;
}
