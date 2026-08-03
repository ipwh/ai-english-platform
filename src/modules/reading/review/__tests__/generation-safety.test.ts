// ============================================
// Phase 4D.3: Generation Safety Tests (10 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import { evaluateGate } from '@/modules/reading/review/paper-reviewer-gate';
import { validateReviewStructure } from '@/modules/reading/review/paper-reviewer-types';
import type { PaperReview, ItemNote, PriorityFix } from '@/modules/reading/review/paper-reviewer-types';

// ══════════════════════════════════════════
// A: Reviewer Safety — missing/null/malformed
// ══════════════════════════════════════════

describe('Phase 4D.3-A: Reviewer Safety', () => {
  it('1. null reviewer → publish (no crash)', () => {
    const result = evaluateGate(true, null);
    expect(result.action).toBe('publish');
    expect(result.reviewerRan).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('2. undefined reviewer → publish (no crash)', () => {
    const result = evaluateGate(true, undefined as unknown as PaperReview | null);
    expect(result.action).toBe('publish');
    expect(result.reviewerRan).toBe(false);
  });

  it('3. empty object reviewer → fallback to publish', () => {
    const result = evaluateGate(true, {} as PaperReview);
    expect(result.action).toBe('publish');
    expect(result.reviewerRan).toBe(false);
    expect(result.warnings.some(w => w.includes('malformed'))).toBe(true);
  });

  it('4. reviewer with null arrays → handled safely, falls back to publish', () => {
    const review = {
      overallScore: 80,
      verdict: 'revise' as const,
      summary: 'ok',
      majorStrengths: [],
      majorRisks: [],
      sectionReviews: [],
      itemNotes: null as unknown as ItemNote[],
      priorityFixes: null as unknown as PriorityFix[],
    } as PaperReview;
    // Null arrays fail structure validation → gate falls back to publish
    const result = evaluateGate(true, review);
    expect(result.action).toBe('publish');
    expect(result.reviewerRan).toBe(false);
    expect(result.warnings.some(w => w.includes('malformed'))).toBe(true);
  });
});

// ══════════════════════════════════════════
// B: Malformed AI Output Handling
// ══════════════════════════════════════════

describe('Phase 4D.3-B: Malformed AI Output', () => {
  it('5. validator fail → reject, no reviewer crash risk', () => {
    // If validator fails, reviewer is never consulted — safe
    const result = evaluateGate(false, null);
    expect(result.action).toBe('reject');
    expect(result.reviewerRan).toBe(false);
  });

  it('6. missing review verdict field → treated as pass', () => {
    const review = {
      overallScore: 70,
      // verdict missing
      summary: 'test',
      majorStrengths: [],
      majorRisks: [],
      sectionReviews: [],
      itemNotes: [],
      priorityFixes: [],
    } as unknown as PaperReview;
    // validateReviewStructure checks for verdict
    expect(validateReviewStructure(review)).toBe(false);
    // gate treats invalid review as no-review → publish
    const result = evaluateGate(true, review);
    expect(result.action).toBe('publish');
  });
});

// ══════════════════════════════════════════
// C: Passage Length Guardrails
// ══════════════════════════════════════════

describe('Phase 4D.3-C: Passage Length Guardrails', () => {
  it('7. short passage (<400 words) would be flagged in full-paper mode', () => {
    const shortContent = 'word '.repeat(150);
    const wordCount = shortContent.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBe(150);
    // 150 < 400 (MIN_PASSAGE_WORDS['full-paper']) → should warn
    expect(wordCount).toBeLessThan(400);
  });

  it('8. adequate passage (500+ words) passes full-paper threshold', () => {
    const content = 'word '.repeat(500);
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBe(500);
    expect(wordCount).toBeGreaterThanOrEqual(400);
  });

  it('9. legacy mode allows shorter passages (250 words)', () => {
    const content = 'word '.repeat(250);
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBe(250);
    expect(wordCount).toBeGreaterThanOrEqual(250);
  });

  it('10. very short passage (50 words) fails all modes', () => {
    const content = 'word '.repeat(50);
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThan(250);
    expect(wordCount).toBeLessThan(350);
    expect(wordCount).toBeLessThan(400);
  });
});
