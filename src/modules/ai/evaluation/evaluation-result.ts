// ============================================
// Sprint 105: Evaluation Result
// Convenience wrappers for creating and formatting evaluation results.
// ============================================

import type { EvaluationOutput, GradingDecision } from './evaluation-types';

/** Create a quick evaluation result for simple comparison. */
export function quickEvaluate(
  studentAnswer: string,
  referenceAnswer: string,
): { score: number; decision: GradingDecision; matched: boolean } {
  const s = studentAnswer.trim().toLowerCase();
  const r = referenceAnswer.trim().toLowerCase();
  if (s === r) return { score: 1, decision: 'correct', matched: true };
  if (s.includes(r) || r.includes(s)) return { score: 0.7, decision: 'partially_correct', matched: true };
  return { score: 0, decision: 'incorrect', matched: false };
}

/** Format an evaluation result as a human-readable string. */
export function formatEvaluationResult(result: EvaluationOutput): string {
  const parts = [
    `Decision: ${result.decision.toUpperCase()}`,
    `Score: ${result.overallScore}`,
    `Semantic: ${result.semanticScore}`,
    `Keywords: ${result.keywordScore} (${result.matchedKeywords.length}/${result.matchedKeywords.length + result.missingKeywords.length})`,
    `Policy: ${result.policy}`,
    `Rules: ${result.triggeredRules.join(', ')}`,
  ];
  return parts.join(' | ');
}
