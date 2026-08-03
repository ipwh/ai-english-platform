// ============================================
// Phase 4D.1: Paper Reviewer Integration Tests (12 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import {
  evaluateGate,
  buildReviewerRetryFeedback,
  buildReviewMetadata,
} from '@/modules/reading/review/paper-reviewer-gate';
import { validateReviewStructure } from '@/modules/reading/review/paper-reviewer-types';
import type { PaperReview } from '@/modules/reading/review/paper-reviewer-types';

/** Helper: create a minimal valid paper review */
function makeReview(overrides: Partial<PaperReview> = {}): PaperReview {
  return {
    overallScore: 78,
    verdict: 'revise',
    summary: 'A decent paper with some issues.',
    majorStrengths: [{ title: 'Good progression', detail: 'Natural difficulty curve.' }],
    majorRisks: [
      {
        type: 'summaryTooLiteral',
        severity: 'high',
        detail: 'Two cloze gaps are direct copies.',
        whyItMatters: 'HKDSE cloze should test grammar, not just lookup.',
        fix: 'Adjust blanks to require part-of-speech change.',
      },
    ],
    sectionReviews: [
      { section: 'passage', score: 85, strengths: ['Natural voice.'], issues: [] },
      { section: 'blueprint', score: 80, strengths: ['Balanced.'], issues: [] },
    ],
    itemNotes: [
      {
        questionId: 'Q7',
        skillTarget: 'tone',
        issueType: 'toneTooFactual',
        severity: 'medium',
        detail: 'Answer is almost explicitly stated.',
        fix: 'Require interpretation of wording.',
      },
    ],
    priorityFixes: [
      { rank: 1, action: 'Tighten summary cloze.', reason: 'Affects DSE realism.' },
    ],
    ...overrides,
  };
}

// ══════════════════════════════════════════
// A: Gate Policy — Validator vs Reviewer
// ══════════════════════════════════════════

describe('Phase 4D.1-A: Gate Policy', () => {
  it('1. validator fail → reject immediately (no reviewer)', () => {
    const result = evaluateGate(false, null);
    expect(result.action).toBe('reject');
    expect(result.validatorPassed).toBe(false);
    expect(result.reviewerRan).toBe(false);
  });

  it('2. validator fail → reject even with good reviewer', () => {
    const review = makeReview({ overallScore: 90, verdict: 'pass' });
    const result = evaluateGate(false, review);
    expect(result.action).toBe('reject');
    expect(result.validatorPassed).toBe(false);
    // Reviewer is ignored when validator fails
    expect(result.reviewerRan).toBe(false);
  });

  it('3. validator pass + no reviewer → publish', () => {
    const result = evaluateGate(true, null);
    expect(result.action).toBe('publish');
    expect(result.reviewerRan).toBe(false);
  });

  it('4. validator pass + reviewer pass → publish', () => {
    const review = makeReview({ overallScore: 92, verdict: 'pass' });
    const result = evaluateGate(true, review);
    expect(result.action).toBe('publish');
    expect(result.reviewerRan).toBe(true);
    expect(result.reviewerVerdict).toBe('pass');
  });

  it('5. validator pass + reviewer revise → warn', () => {
    const review = makeReview({ overallScore: 72, verdict: 'revise' });
    const result = evaluateGate(true, review);
    expect(result.action).toBe('warn');
    expect(result.reviewerVerdict).toBe('revise');
    expect(result.priorityFixes).toBeDefined();
    expect(result.priorityFixes!.length).toBeGreaterThan(0);
  });

  it('6. validator pass + reviewer reject → retry', () => {
    const review = makeReview({ overallScore: 55, verdict: 'reject' });
    const result = evaluateGate(true, review);
    expect(result.action).toBe('retry');
    expect(result.reviewerVerdict).toBe('reject');
    expect(result.includeReviewerFeedback).toBe(true);
  });
});

// ══════════════════════════════════════════
// B: Malformed Reviewer Handling
// ══════════════════════════════════════════

describe('Phase 4D.1-B: Malformed Reviewer', () => {
  it('7. malformed reviewer output → falls back to publish', () => {
    const result = evaluateGate(true, { invalid: true } as unknown as PaperReview);
    expect(result.action).toBe('publish');
    expect(result.reviewerRan).toBe(false);
    expect(result.warnings.some(w => w.includes('malformed'))).toBe(true);
  });

  it('8. validator pass + null reviewer → publish', () => {
    const result = evaluateGate(true, null);
    expect(result.action).toBe('publish');
  });
});

// ══════════════════════════════════════════
// C: Retry Feedback Builder
// ══════════════════════════════════════════

describe('Phase 4D.1-C: Retry Feedback', () => {
  it('9. retry feedback includes high-severity risks', () => {
    const review = makeReview({
      majorRisks: [
        {
          type: 'summaryTooLiteral', severity: 'high',
          detail: 'Cloze gaps are direct copies.',
          whyItMatters: 'Tests only lookup.',
          fix: 'Add grammar change requirement.',
        },
        {
          type: 'blueprintImbalance', severity: 'medium',
          detail: 'Too many factual items.',
          whyItMatters: 'Reduces assessment diversity.',
          fix: 'Add inference items.',
        },
      ],
      priorityFixes: [{ rank: 1, action: 'Fix cloze.', reason: 'Critical for DSE realism.' }],
    });
    const feedback = buildReviewerRetryFeedback(review);
    expect(feedback).toContain('summaryTooLiteral');
    expect(feedback).toContain('Fix cloze');
    // Medium severity risks should not appear in retry feedback (only high)
    expect(feedback).not.toContain('blueprintImbalance');
  });

  it('10. retry feedback includes item-level high/medium notes', () => {
    const review = makeReview({
      itemNotes: [
        { questionId: 'Q3', skillTarget: 'inference', issueType: 'questionTooLeading', severity: 'high', detail: 'Stem gives away answer.', fix: 'Rephrase stem.' },
        { questionId: 'Q5', skillTarget: 'vocabulary', issueType: 'vocabularyTooObvious', severity: 'medium', detail: 'Word defined nearby.', fix: 'Choose different word.' },
        { questionId: 'Q8', skillTarget: 'mc', issueType: 'weakDistractors', severity: 'low', detail: 'Distractor C too obvious.', fix: 'Make more plausible.' },
      ],
    });
    const feedback = buildReviewerRetryFeedback(review);
    expect(feedback).toContain('Q3');
    expect(feedback).toContain('Q5');
    // Low severity should not appear
    expect(feedback).not.toContain('Q8');
  });
});

// ══════════════════════════════════════════
// D: Review Metadata Builder
// ══════════════════════════════════════════

describe('Phase 4D.1-D: Review Metadata', () => {
  it('11. metadata when reviewer not run returns reviewerRan: false', () => {
    const gateResult = evaluateGate(true, null);
    const meta = buildReviewMetadata(gateResult, null);
    expect(meta.reviewerRan).toBe(false);
    expect(meta).not.toHaveProperty('reviewerVerdict');
  });

  it('12. metadata when reviewer ran includes key fields', () => {
    const review = makeReview({ overallScore: 85, verdict: 'pass' });
    const gateResult = evaluateGate(true, review);
    const meta = buildReviewMetadata(gateResult, review);
    expect(meta.reviewerRan).toBe(true);
    expect(meta.reviewerVerdict).toBe('pass');
    expect(meta.reviewerScore).toBe(85);
    expect(meta.gateAction).toBe('publish');
    expect(meta.reviewerSummary).toBe(review.summary);
  });
});
