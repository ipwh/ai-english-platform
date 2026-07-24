// ============================================
// Sprint 112: Fairness Engine
// Coordinates fairness rules over student/reference answer pairs.
// ============================================

import type { FairnessResult, FairnessInput, FairnessContext, FairnessCheck } from './fairness-types';
import { calculateFairnessScore, determineFairnessDecision, computePartialCredit, createFairnessDimensions, DEFAULT_FAIRNESS_CONTEXT } from './fairness-types';
import { initFairnessRegistry, getRulesByPriority } from './fairness-registry';
import { recordFairnessEvaluation, recordRuleExecution } from './fairness-metrics';

/** Evaluate fairness of a student answer against a reference */
export function evaluateFairness(input: FairnessInput): FairnessResult {
  const start = Date.now();

  initFairnessRegistry();
  const rules = getRulesByPriority();

  if (!input.studentAnswer || !input.referenceAnswer) {
    return emptyResult(start);
  }

  let currentInput = { ...input };
  const allChecks: FairnessCheck[] = [];
  const ctx: FairnessContext = { ...DEFAULT_FAIRNESS_CONTEXT };

  // Apply each fairness rule sequentially
  for (const rule of rules) {
    const { input: newInput, check } = rule.evaluate(currentInput, ctx);
    currentInput = newInput;
    allChecks.push(check);
    if (!check.passed) {
      ctx.scoreAdjustments -= (1 - check.score) * 15; // each failure deducts up to 15 points
      ctx.appliedRules.push(rule.id);
      ctx.confidence *= Math.max(0.5, check.score);
    }
    recordRuleExecution(rule.id, !check.passed);
  }

  // Compute dimensions
  const dims = createFairnessDimensions();
  const failedChecks = allChecks.filter(c => !c.passed);

  for (const check of failedChecks) {
    const penalty = (1 - check.score) * 100;
    switch (check.ruleId) {
      case 'fair:article-tolerance':
      case 'fair:punctuation-tolerance':
      case 'fair:case-tolerance':
      case 'fair:whitespace-tolerance':
        dims.grammarFairness = Math.max(0, dims.grammarFairness - penalty * 0.5);
        break;
      case 'fair:british-american':
      case 'fair:abbreviation':
        dims.languageFairness = Math.max(0, dims.languageFairness - penalty);
        break;
      case 'fair:spelling-tolerance':
        dims.spellingFairness = Math.max(0, dims.spellingFairness - penalty);
        break;
      case 'fair:verb-tense':
      case 'fair:singular-plural':
        dims.grammarFairness = Math.max(0, dims.grammarFairness - penalty);
        break;
      case 'fair:number-normalization':
      case 'fair:synonym-expansion':
        dims.languageFairness = Math.max(0, dims.languageFairness - penalty * 0.7);
        break;
      case 'fair:keyword-coverage':
        dims.keywordCoverage = Math.max(0, dims.keywordCoverage - penalty);
        break;
      case 'fair:semantic-confidence':
        dims.semanticFairness = Math.max(0, dims.semanticFairness - penalty);
        break;
      case 'fair:partial-credit':
        // Partial credit doesn't deduct, it's informational
        break;
    }
  }

  const dimensions = calculateFairnessScore(dims);
  const decision = determineFairnessDecision(dimensions.overall);
  const partialCredit = computePartialCredit(dimensions.overall);

  // Top contributors
  const topContributors = failedChecks
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map(c => c.ruleId);

  const warnings = failedChecks
    .filter(c => c.priority === 'high' || c.priority === 'critical')
    .map(c => `[${c.ruleId}] ${c.detail || 'failed'}`);

  const result: FairnessResult = {
    decision,
    dimensions,
    score: dimensions.overall,
    confidence: ctx.confidence,
    checks: allChecks,
    partialCredit,
    normalizedAnswer: currentInput.studentAnswer,
    normalizedReference: currentInput.referenceAnswer,
    topContributors,
    warnings,
    metadata: {
      totalChecks: allChecks.length,
      passed: allChecks.filter(c => c.passed).length,
      failed: failedChecks.length,
      durationMs: Date.now() - start,
    },
  };

  recordFairnessEvaluation(result);
  return result;
}

function emptyResult(start: number): FairnessResult {
  return {
    decision: 'incorrect',
    dimensions: { ...createFairnessDimensions(), overall: 0 },
    score: 0,
    confidence: 0,
    checks: [],
    partialCredit: 0,
    normalizedAnswer: '',
    normalizedReference: '',
    topContributors: [],
    warnings: ['Empty student or reference answer'],
    metadata: { totalChecks: 0, passed: 0, failed: 0, durationMs: Date.now() - start },
  };
}
