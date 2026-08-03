// ============================================
// Phase 4D.1: Paper Reviewer Gating Policy
// Connects the paper reviewer to generation, validation, and retry flows.
// ============================================

import type { PaperReview, ReviewerVerdict } from './paper-reviewer-types';
import { validateReviewStructure } from './paper-reviewer-types';

/** Gating policy: how reviewer verdict combines with validator results */
export interface ReviewGateResult {
  /** Final action to take */
  action: 'publish' | 'warn' | 'retry' | 'reject';
  /** Whether the paper passed blueprint validation */
  validatorPassed: boolean;
  /** Whether a reviewer was run (false if reviewer skipped) */
  reviewerRan: boolean;
  /** Reviewer verdict (only meaningful if reviewerRan) */
  reviewerVerdict?: ReviewerVerdict;
  /** Reviewer overall score (only meaningful if reviewerRan) */
  reviewerScore?: number;
  /** Combined warnings from validator and reviewer */
  warnings: string[];
  /** Priority fixes from reviewer, if available */
  priorityFixes?: { rank: number; action: string; reason: string }[];
  /** Whether regeneration should include reviewer feedback */
  includeReviewerFeedback: boolean;
}

/**
 * Phase 4D.1: Gating policy — determines action from validator + reviewer results.
 *
 * Policy:
 * - Validator hard fail (critical issues) → reject immediately (no reviewer)
 * - Validator pass + reviewer reject → retry with reviewer feedback
 * - Validator pass + reviewer revise → warn, return with priority fixes
 * - Validator pass + reviewer pass → publish
 * - No reviewer run + validator pass → publish
 */
export function evaluateGate(
  validatorPassed: boolean,
  reviewerResult: PaperReview | null,
): ReviewGateResult {
  const warnings: string[] = [];

  // Validator hard fail → reject immediately
  if (!validatorPassed) {
    return {
      action: 'reject',
      validatorPassed: false,
      reviewerRan: false,
      warnings: ['Blueprint validation failed with critical issues.'],
      includeReviewerFeedback: false,
    };
  }

  // No reviewer → publish (basic path)
  if (!reviewerResult || !validateReviewStructure(reviewerResult)) {
    return {
      action: 'publish',
      validatorPassed: true,
      reviewerRan: false,
      warnings: reviewerResult ? ['Reviewer output malformed — falling back to validator-only path.'] : [],
      includeReviewerFeedback: false,
    };
  }

  const verdict = reviewerResult.verdict;
  const score = reviewerResult.overallScore;

  // Collect reviewer warnings
  for (const risk of reviewerResult.majorRisks) {
    if (risk.severity === 'high') {
      warnings.push(`[HIGH] ${risk.type}: ${risk.detail}`);
    }
  }

  switch (verdict) {
    case 'reject':
      return {
        action: 'retry',
        validatorPassed: true,
        reviewerRan: true,
        reviewerVerdict: 'reject',
        reviewerScore: score,
        warnings: [...warnings, 'Paper rejected by reviewer — regeneration required.'],
        priorityFixes: reviewerResult.priorityFixes,
        includeReviewerFeedback: true,
      };

    case 'revise':
      return {
        action: 'warn',
        validatorPassed: true,
        reviewerRan: true,
        reviewerVerdict: 'revise',
        reviewerScore: score,
        warnings: [...warnings, 'Paper flagged for revision — review priority fixes before publishing.'],
        priorityFixes: reviewerResult.priorityFixes,
        includeReviewerFeedback: false,
      };

    case 'pass':
      return {
        action: 'publish',
        validatorPassed: true,
        reviewerRan: true,
        reviewerVerdict: 'pass',
        reviewerScore: score,
        warnings,
        includeReviewerFeedback: false,
      };

    default:
      return {
        action: 'publish',
        validatorPassed: true,
        reviewerRan: true,
        reviewerVerdict: undefined,
        reviewerScore: score,
        warnings: [...warnings, `Unknown reviewer verdict "${verdict as string}" — treating as pass.`],
        includeReviewerFeedback: false,
      };
  }
}

/**
 * Phase 4D.1: Build reviewer feedback for retry prompt injection.
 * Extracts actionable guidance from reviewer output to guide regeneration.
 */
export function buildReviewerRetryFeedback(review: PaperReview): string {
  const lines: string[] = ['## ⚠️ Paper Review Feedback for Regeneration'];

  for (const risk of review.majorRisks) {
    if (risk.severity === 'high') {
      lines.push(`- [${risk.severity}] ${risk.type}: ${risk.detail}`);
      lines.push(`  Fix: ${risk.fix}`);
    }
  }

  if (review.priorityFixes && review.priorityFixes.length > 0) {
    lines.push('\n### Priority Fixes:');
    for (const pf of review.priorityFixes) {
      lines.push(`${pf.rank}. ${pf.action} — ${pf.reason}`);
    }
  }

  if (review.itemNotes && review.itemNotes.length > 0) {
    lines.push('\n### Item-Level Issues:');
    for (const note of review.itemNotes) {
      if (note.severity === 'high' || note.severity === 'medium') {
        lines.push(`- Q${note.questionId} [${note.skillTarget}]: ${note.detail} → ${note.fix}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Phase 4D.1: Build review metadata for API response.
 * Safe to include even when reviewer wasn't run (returns nullish shape).
 */
export function buildReviewMetadata(
  gateResult: ReviewGateResult,
  review: PaperReview | null,
): Record<string, unknown> {
  if (!gateResult.reviewerRan || !review) {
    return { reviewerRan: false };
  }

  return {
    reviewerRan: true,
    reviewerVerdict: gateResult.reviewerVerdict,
    reviewerScore: gateResult.reviewerScore,
    gateAction: gateResult.action,
    reviewerSummary: review.summary,
    majorRisks: review.majorRisks.slice(0, 5),
    priorityFixes: review.priorityFixes?.slice(0, 3),
  };
}
