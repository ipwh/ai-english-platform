// ============================================
// Sprint 105: Evaluation Engine
// Orchestrates the full evaluation pipeline.
// ============================================

import type {
  EvaluationInput, EvaluationOutput, GradingDecision, GradingPolicyConfig, GradingPolicy,
} from './evaluation-types';
import { GRADING_POLICIES } from './evaluation-types';
import { normalizeAnswer } from './answer-normalizer';
import { gradingRegistry } from './grading-registry';
import { computeKeywordScore } from './semantic-comparator';
import {
  exactMatchRule, caseInsensitiveRule, punctuationRule, whitespaceRule,
  articleRule, pluralRule, tenseRule, spellingRule, synonymRule,
  semanticRule, keywordRule,
} from './rules';
import { recordEvaluation, recordGrading, recordRuleUsage } from './evaluation-metrics';
import { logger } from '@/shared/logger/logger';

class EvaluationEngine {
  private initialized = false;

  /** Register all built-in evaluation rules. Idempotent. */
  init(): this {
    if (this.initialized) return this;
    gradingRegistry
      .register(exactMatchRule)
      .register(caseInsensitiveRule)
      .register(punctuationRule)
      .register(whitespaceRule)
      .register(articleRule)
      .register(pluralRule)
      .register(tenseRule)
      .register(spellingRule)
      .register(synonymRule)
      .register(semanticRule)
      .register(keywordRule);
    this.initialized = true;
    return this;
  }

  /** Evaluate a student answer against a reference. */
  evaluate(input: EvaluationInput): EvaluationOutput {
    this.init();
    const startTime = Date.now();

    // Get policy configuration
    const policy: GradingPolicy = input.policy || 'standard';
    const config: GradingPolicyConfig = {
      ...GRADING_POLICIES[policy],
      ...(input.policyOverrides || {}),
    };

    // Normalize
    const normalizedStudent = normalizeAnswer(input.studentAnswer, { keepPunctuation: true });
    const normalizedReference = normalizeAnswer(input.referenceAnswer, { keepPunctuation: true });

    // Run all rules
    const ruleResults = gradingRegistry.evaluateAll(
      normalizedStudent, normalizedReference, config,
    );

    // Keyword scoring
    const keywords = input.keywords || [];
    const { score: keywordScore, matched: matchedKeywords, missing: missingKeywords } =
      computeKeywordScore(input.studentAnswer, keywords);

    // Rule scores
    const exactScore = ruleResults.find(r => r.rule === 'exact-match')?.result.score || 0;
    const caseScore = ruleResults.find(r => r.rule === 'case-insensitive')?.result.score || 0;
    const semanticResult = ruleResults.find(r => r.rule === 'semantic');
    const semanticScore = semanticResult?.result?.score ?? 0;

    // Grammar score (average of article, plural, tense, spelling)
    const grammarRules = ['article', 'plural', 'tense', 'spelling'];
    const grammarScore = grammarRules
      .map(r => ruleResults.find(x => x.rule === r)?.result.score || 0)
      .reduce((a, b) => a + b, 0) / grammarRules.length;

    // Overall score: weighted combination
    const overallScore = Math.round(
      (exactScore * 0.15 + caseScore * 0.05 + semanticScore * 0.45 + keywordScore * 0.25 + grammarScore * 0.10) * 100,
    ) / 100;

    // Decision
    let decision: GradingDecision;
    if (exactScore >= 1 || caseScore >= 1) {
      decision = 'correct';
    } else if (semanticScore >= config.minSemanticScore && keywordScore >= config.minKeywordCoverage) {
      decision = 'correct';
    } else if (semanticScore >= 0.3 || keywordScore >= 0.3) {
      decision = 'partially_correct';
    } else {
      decision = 'incorrect';
    }

    // Track metrics
    const elapsed = Date.now() - startTime;
    recordEvaluation(elapsed);
    recordGrading(decision);
    ruleResults.forEach(r => recordRuleUsage(r.rule, r.result.passed));

    const output: EvaluationOutput = {
      studentAnswer: input.studentAnswer,
      referenceAnswer: input.referenceAnswer,
      normalizedStudent,
      normalizedReference,
      exactMatch: exactScore >= 1,
      caseInsensitiveMatch: caseScore >= 1,
      keywordScore,
      semanticScore,
      grammarScore,
      overallScore,
      decision,
      policy,
      matchedKeywords,
      missingKeywords,
      triggeredRules: ruleResults.filter(r => r.result.passed).map(r => r.rule),
      details: {
        ruleResults: ruleResults.map(r => ({
          rule: r.rule,
          score: r.result.score,
          passed: r.result.passed,
          detail: r.result.detail,
        })),
      },
    };

    logger.info({
      module: 'evaluation-engine',
      policy,
      decision,
      overallScore,
      semanticScore,
      keywordScore,
      elapsed,
    }, 'Answer evaluated');

    return output;
  }
}

export const evaluationEngine = new EvaluationEngine();
