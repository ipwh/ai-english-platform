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
// Lazy import for embedding fallback (avoids loading Vertex AI module on every import)
async function getEmbeddingComparator() {
  const { computeSemanticScoreWithEmbedding } = await import('./semantic-comparator');
  return computeSemanticScoreWithEmbedding;
}
import {
  exactMatchRule, caseInsensitiveRule, punctuationRule, whitespaceRule,
  articleRule, pluralRule, tenseRule, spellingRule, synonymRule,
  semanticRule, keywordRule,
} from './rules';
import { recordEvaluation, recordGrading, recordRuleUsage } from './evaluation-metrics';
import { logger } from '@/shared/logger/logger';
import { BaseRuleEngine } from '../core/base-engine';

class EvaluationEngine extends BaseRuleEngine {
  /** Register all built-in evaluation rules. */
  protected registerRules(): void {
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

  /**
   * Evaluate with embedding fallback for borderline cases.
   * When keyword matching gives a low score but the student may have paraphrased well,
   * this method uses Vertex AI embeddings to detect semantic similarity.
   *
   * Educational benefit: Students who use different wording to express the same
   * meaning should NOT lose marks. This rewards paraphrasing — a key DSE skill.
   *
   * Performance: Only calls embedding API when decision is 'partially_correct'
   * AND semanticScore < 0.5. Fast path returns the synchronous result directly.
   */
  async evaluateWithEmbedding(input: EvaluationInput): Promise<EvaluationOutput> {
    // Fast path: run synchronous evaluation first
    const result = this.evaluate(input);

    // Only attempt embedding if the decision is borderline
    if (result.decision !== 'partially_correct') {
      return result;
    }

    // Only if keyword-based semantic score is low enough that paraphrasing might be missed
    if (result.semanticScore >= 0.5) {
      return result;
    }

    try {
      const computeWithEmbedding = await getEmbeddingComparator();
      const { score: boostedScore, usedEmbedding, embeddingScore } =
        await computeWithEmbedding(input.studentAnswer, input.referenceAnswer);

      if (usedEmbedding && embeddingScore && embeddingScore > 0.65) {
        // Embedding detected semantic similarity — the student likely paraphrased well
        const newOverallScore = Math.round(
          (result.exactMatch ? 1 : 0) * 0.15 * 100 +
          (result.caseInsensitiveMatch ? 1 : 0) * 0.05 * 100 +
          boostedScore * 0.45 * 100 +
          result.keywordScore * 0.25 * 100 +
          result.grammarScore * 0.10 * 100,
        ) / 100;

        // If boosted score crosses the threshold, upgrade to correct
        const newDecision: GradingDecision =
          boostedScore >= 0.5 ? 'correct' : 'partially_correct';

        logger.info({
          module: 'evaluation-engine',
          originalDecision: result.decision,
          newDecision,
          originalScore: result.overallScore,
          newOverallScore,
          embeddingScore,
        }, 'Embedding fallback upgraded answer');

        return {
          ...result,
          semanticScore: Math.round(boostedScore * 100) / 100,
          overallScore: newOverallScore,
          decision: newDecision,
          embeddingUsed: true,
          embeddingScore: Math.round(embeddingScore * 100) / 100,
          details: {
            ...result.details,
            embeddingNote: 'Score boosted by semantic embedding similarity',
          },
        };
      }
    } catch (err) {
      // Embedding unavailable — silently return original result
      logger.warn({
        module: 'evaluation-engine',
        error: String(err),
      }, 'Embedding fallback failed, using keyword score');
    }

    return result;
  }
}

export const evaluationEngine = new EvaluationEngine();
