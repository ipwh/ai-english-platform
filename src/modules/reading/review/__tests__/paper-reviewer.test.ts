// ============================================
// Phase 4D: Paper Reviewer Tests (15 tests)
// ============================================

import { describe, it, expect } from 'vitest';
import {
  calculateOverallScore,
  scoreToVerdict,
  validateReviewStructure,
  SEVERITY_WEIGHTS,
  SECTION_WEIGHTS,
  REVIEW_ISSUE_DESCRIPTIONS,
} from '@/modules/reading/review/paper-reviewer-types';
import { buildPaperReviewerPrompt } from '@/modules/reading/review/paper-reviewer';
import type { PaperReview, SectionReview, ReviewSection } from '@/modules/reading/review/paper-reviewer-types';

// ══════════════════════════════════════════
// A: Scoring & Verdict
// ══════════════════════════════════════════

describe('Phase 4D-A: Scoring & Verdict', () => {
  it('1. score ≥85 returns pass', () => {
    expect(scoreToVerdict(85)).toBe('pass');
    expect(scoreToVerdict(92)).toBe('pass');
  });

  it('2. score 65-84 returns revise', () => {
    expect(scoreToVerdict(65)).toBe('revise');
    expect(scoreToVerdict(78)).toBe('revise');
    expect(scoreToVerdict(84)).toBe('revise');
  });

  it('3. score <65 returns reject', () => {
    expect(scoreToVerdict(64)).toBe('reject');
    expect(scoreToVerdict(30)).toBe('reject');
  });

  it('4. calculateOverallScore computes weighted average', () => {
    const sections: SectionReview[] = [
      { section: 'passage', score: 80, strengths: [], issues: [] },
      { section: 'blueprint', score: 70, strengths: [], issues: [] },
      { section: 'mc', score: 90, strengths: [], issues: [] },
    ];
    const score = calculateOverallScore(sections);
    // (80*15 + 70*15 + 90*12) / (15+15+12) = (1200+1050+1080)/42 = 3330/42 ≈ 79
    expect(score).toBeGreaterThanOrEqual(75);
    expect(score).toBeLessThanOrEqual(85);
  });

  it('5. all sections perfect = 100', () => {
    const sections: SectionReview[] = (Object.keys(SECTION_WEIGHTS) as ReviewSection[]).map(s => ({
      section: s, score: 100, strengths: [], issues: [],
    }));
    expect(calculateOverallScore(sections)).toBe(100);
  });

  it('6. SEVERITY_WEIGHTS have expected values', () => {
    expect(SEVERITY_WEIGHTS.low).toBe(2);
    expect(SEVERITY_WEIGHTS.medium).toBe(5);
    expect(SEVERITY_WEIGHTS.high).toBe(12);
    expect(SEVERITY_WEIGHTS.high).toBeGreaterThan(SEVERITY_WEIGHTS.medium);
    expect(SEVERITY_WEIGHTS.medium).toBeGreaterThan(SEVERITY_WEIGHTS.low);
  });
});

// ══════════════════════════════════════════
// B: Structure Validation
// ══════════════════════════════════════════

describe('Phase 4D-B: Structure Validation', () => {
  it('7. valid review passes validation', () => {
    const review: PaperReview = {
      overallScore: 78,
      verdict: 'revise',
      summary: 'A decent paper.',
      majorStrengths: [{ title: 'Good', detail: 'Good progression.' }],
      majorRisks: [],
      sectionReviews: [],
      itemNotes: [],
      priorityFixes: [],
    };
    expect(validateReviewStructure(review)).toBe(true);
  });

  it('8. missing fields fail validation', () => {
    expect(validateReviewStructure(null)).toBe(false);
    expect(validateReviewStructure(undefined)).toBe(false);
    expect(validateReviewStructure({})).toBe(false);
    expect(validateReviewStructure({ overallScore: 50 })).toBe(false);
  });

  it('9. wrong verdict value fails validation', () => {
    const review = {
      overallScore: 50,
      verdict: 'maybe',
      summary: 'test',
      majorStrengths: [],
      majorRisks: [],
      sectionReviews: [],
      itemNotes: [],
      priorityFixes: [],
    };
    expect(validateReviewStructure(review)).toBe(false);
  });
});

// ══════════════════════════════════════════
// C: Issue Descriptions
// ══════════════════════════════════════════

describe('Phase 4D-C: Issue Descriptions', () => {
  it('10. all issue types have descriptions', () => {
    const types = Object.keys(REVIEW_ISSUE_DESCRIPTIONS);
    expect(types.length).toBeGreaterThanOrEqual(20);
    for (const t of types) {
      expect(REVIEW_ISSUE_DESCRIPTIONS[t as keyof typeof REVIEW_ISSUE_DESCRIPTIONS]).toBeTruthy();
      expect(REVIEW_ISSUE_DESCRIPTIONS[t as keyof typeof REVIEW_ISSUE_DESCRIPTIONS].length).toBeGreaterThan(10);
    }
  });

  it('11. SECTION_WEIGHTS sum to 100', () => {
    const total = Object.values(SECTION_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBe(100);
  });

  it('12. all ReviewSections have weight entries', () => {
    const sections: ReviewSection[] = [
      'passage', 'blueprint', 'mc', 'reference', 'vocabulary',
      'inference', 'tone', 'wholeText', 'summaryCloze',
      'sentenceTransformation', 'feedback', 'partA',
    ];
    for (const s of sections) {
      expect(SECTION_WEIGHTS[s]).toBeDefined();
      expect(SECTION_WEIGHTS[s]).toBeGreaterThan(0);
    }
  });
});

// ══════════════════════════════════════════
// D: Prompt Builder
// ══════════════════════════════════════════

describe('Phase 4D-D: Prompt Builder', () => {
  it('13. buildPaperReviewerPrompt returns non-empty string', () => {
    const prompt = buildPaperReviewerPrompt();
    expect(prompt.length).toBeGreaterThan(500);
  });

  it('14. prompt contains key rubric sections', () => {
    const prompt = buildPaperReviewerPrompt();
    expect(prompt).toContain('HKDSE');
    expect(prompt).toContain('Passage Naturalness');
    expect(prompt).toContain('Blueprint Balance');
    expect(prompt).toContain('Distractor Quality');
    expect(prompt).toContain('Summary Cloze');
    expect(prompt).toContain('Sentence Transformation');
    expect(prompt).toContain('overallScore');
  });

  it('15. prompt contains all issue type codes', () => {
    const prompt = buildPaperReviewerPrompt();
    expect(prompt).toContain('skillOverlap');
    expect(prompt).toContain('weakDistractors');
    expect(prompt).toContain('summaryTooLiteral');
    expect(prompt).toContain('wholeTextTooLocal');
    expect(prompt).toContain('toneTooFactual');
  });
});
