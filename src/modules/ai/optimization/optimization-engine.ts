// ============================================
// Sprint 108: Optimization Engine
// Deterministic UX optimization. No LLM calls.
// ============================================

import type { OptimizationResult, OptimizationDimensions, OptimizationCheck } from './optimization-types';
import { calculateOptimizationScore, determineOptimizationDecision } from './optimization-types';
import { optimizationRegistry } from './optimization-registry';
import { recordOptimization, recordRuleExecution } from './optimization-metrics';
import {
  studentToleranceRule, answerQualityRule, distractorRule,
  mcqBalanceRule, explanationRule, difficultyRebalanceRule, optionNaturalnessRule,
  wordingRule, duplicateChoiceRule, readabilityRule, writingPromptRule, vocabularySmoothingRule,
} from './rules';
import { logger } from '@/shared/logger/logger';

class OptimizationEngine {
  private initialized = false;

  init(): this {
    if (this.initialized) return this;
    optimizationRegistry
      .register(studentToleranceRule).register(answerQualityRule).register(distractorRule)
      .register(mcqBalanceRule).register(explanationRule).register(difficultyRebalanceRule)
      .register(optionNaturalnessRule).register(wordingRule).register(duplicateChoiceRule)
      .register(readabilityRule).register(writingPromptRule).register(vocabularySmoothingRule);
    this.initialized = true;
    return this;
  }

  optimize(question: Record<string, unknown>, assessmentScore?: number): OptimizationResult {
    this.init();
    const startTime = Date.now();

    const { question: optimized, checks } = optimizationRegistry.optimizeAll(question, assessmentScore);

    // Compute dimension scores
    const dims = computeDimensions(checks, optimized);
    const fullDims = calculateOptimizationScore(dims);

    const hasCritical = checks.some(c => !c.passed && c.priority === 'critical');
    const hasOptimized = checks.some(c => !c.passed && c.action === 'repair');
    const decision = determineOptimizationDecision(fullDims.overall, hasCritical, hasOptimized);

    const warnings = checks.filter(c => !c.passed).map(c => c.message || '').filter(Boolean);
    const elapsed = Date.now() - startTime;

    recordOptimization(decision, fullDims.overall, elapsed, checks.filter(c => !c.passed && c.action === 'repair').length);
    checks.forEach(c => recordRuleExecution(c.ruleId, c.passed, c.action));

    const result: OptimizationResult = {
      decision, dimensions: fullDims, score: fullDims.overall,
      checks, repaired: checks.filter(c => c.action === 'repair').length,
      flagged: checks.filter(c => c.action === 'flag').length,
      warnings,
      metadata: { totalChecks: checks.length, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).length, durationMs: elapsed },
    };

    logger.info({ module: 'opt-engine', decision, score: fullDims.overall, repairs: result.repaired, elapsed }, 'Optimization complete');
    return result;
  }
}

function computeDimensions(checks: OptimizationCheck[], q: Record<string, unknown>): Omit<OptimizationDimensions, 'overall'> {
  const avg = (ids: string[]) => {
    const relevant = checks.filter(c => ids.includes(c.ruleId));
    return relevant.length > 0 ? Math.round(relevant.reduce((s, c) => s + c.score * 100, 0) / relevant.length) : 100;
  };

  const studentExp = avg(['opt:student-tolerance', 'opt:answer-quality', 'opt:wording', 'opt:readability']);
  const assessment = avg(['opt:answer-quality', 'opt:mcq-balance', 'opt:duplicate-choices']);
  const readability = avg(['opt:readability', 'opt:option-naturalness', 'opt:wording']);
  const consistency = avg(['opt:duplicate-choices', 'opt:mcq-balance', 'opt:distractor-quality']);
  const difficulty = avg(['opt:difficulty-rebalance', 'opt:vocabulary-smoothing']);
  const repairability = checks.filter(c => c.action === 'repair' || c.action === 'normalize').length > 0
    ? Math.round(checks.filter(c => c.action === 'repair' || c.action === 'normalize').reduce((s, c) => s + 50, 0) / Math.max(1, checks.filter(c => !c.passed).length))
    : 100;

  return { studentExperience: studentExp, assessment, readability, consistency, difficulty, repairability };
}

export const optimizationEngine = new OptimizationEngine();
