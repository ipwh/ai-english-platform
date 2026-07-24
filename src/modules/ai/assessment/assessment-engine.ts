// ============================================
// Sprint 106: Assessment Engine
// ============================================

import type { AssessmentResult, AssessmentDimensions, AssessmentCheck, AssessmentContext } from './assessment-types';
import { calculateAssessmentScore, determineDecision } from './assessment-types';
import { assessmentRegistry } from './assessment-registry';
import { recordAssessment, recordRuleResult } from './assessment-metrics';
import {
  mcqQualityRule, distractorQualityRule, answerUniquenessRule, difficultyAlignmentRule,
  questionClarityRule, optionBalanceRule, passageAlignmentRule, listeningAlignmentRule,
  referenceQualityRule, vocabularyLevelRule, grammarQualityRule, writingPromptQualityRule,
  integratedSkillsQualityRule,
} from './rules';
import { logger } from '@/shared/logger/logger';

class AssessmentEngine {
  private initialized = false;

  init(): this {
    if (this.initialized) return this;
    assessmentRegistry
      .register(mcqQualityRule)
      .register(distractorQualityRule)
      .register(answerUniquenessRule)
      .register(difficultyAlignmentRule)
      .register(questionClarityRule)
      .register(optionBalanceRule)
      .register(passageAlignmentRule)
      .register(listeningAlignmentRule)
      .register(referenceQualityRule)
      .register(vocabularyLevelRule)
      .register(grammarQualityRule)
      .register(writingPromptQualityRule)
      .register(integratedSkillsQualityRule);
    this.initialized = true;
    return this;
  }

  assess(question: Record<string, unknown>, context?: AssessmentContext): AssessmentResult {
    const startTime = Date.now();
    const checks = assessmentRegistry.assessAll(question, context);

    // Compute dimension scores
    const dimScores: Record<string, { sum: number; count: number }> = {};
    for (const check of checks) {
      const dim = mapRuleToDimension(check.ruleId);
      if (!dimScores[dim]) dimScores[dim] = { sum: 0, count: 0 };
      dimScores[dim].sum += check.score * 100;
      dimScores[dim].count++;
    }

    const dimensions: Omit<AssessmentDimensions, 'overall'> = {
      validity: avgDim(dimScores, 'validity'),
      reliability: avgDim(dimScores, 'reliability'),
      fairness: avgDim(dimScores, 'fairness'),
      difficulty: avgDim(dimScores, 'difficulty'),
      pedagogy: avgDim(dimScores, 'pedagogy'),
    };
    const fullDimensions = calculateAssessmentScore(dimensions);

    const hasCritical = checks.some(c => !c.passed && c.priority === 'critical');
    const hasHigh = checks.some(c => !c.passed && c.priority === 'high');
    const decision = determineDecision(fullDimensions.overall, hasCritical, hasHigh);

    const warnings = checks.filter(c => !c.passed && c.priority !== 'critical').map(c => c.message || '');
    const errors = checks.filter(c => !c.passed && c.priority === 'critical').map(c => c.message || '');
    const recommendations = checks.filter(c => !c.passed).map(c => c.recommendation || c.message || '');

    const elapsed = Date.now() - startTime;
    recordAssessment(decision, fullDimensions.overall, elapsed);
    checks.forEach(c => recordRuleResult(c.ruleId, c.passed));

    const result: AssessmentResult = {
      decision, dimensions: fullDimensions, score: fullDimensions.overall,
      checks, warnings, errors, recommendations,
      metadata: { totalChecks: checks.length, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).length, durationMs: elapsed },
    };

    logger.info({ module: 'assessment-engine', decision, score: fullDimensions.overall, checks: checks.length, elapsed }, 'Assessment complete');
    return result;
  }
}

function avgDim(dims: Record<string, { sum: number; count: number }>, key: string): number {
  const d = dims[key];
  return d && d.count > 0 ? Math.round(d.sum / d.count) : 100;
}

/** Map rule IDs to assessment dimensions */
function mapRuleToDimension(ruleId: string): keyof Omit<AssessmentDimensions, 'overall'> {
  if (ruleId.includes('mcq') || ruleId.includes('option') || ruleId.includes('answer')) return 'validity';
  if (ruleId.includes('difficulty') || ruleId.includes('vocabulary') || ruleId.includes('grammar')) return 'difficulty';
  if (ruleId.includes('distractor') || ruleId.includes('balance')) return 'fairness';
  if (ruleId.includes('passage') || ruleId.includes('listening') || ruleId.includes('reference') || ruleId.includes('integrated')) return 'reliability';
  if (ruleId.includes('clarity') || ruleId.includes('writing') || ruleId.includes('prompt')) return 'pedagogy';
  return 'validity';
}

export const assessmentEngine = new AssessmentEngine();
