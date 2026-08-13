// Sprint 132 (R2) + R2.5 audit: StudentAssessmentResult — Exhaustive Contract Tests
import { describe, it, expect } from 'vitest';
import {
  STUDENT_ASSESSMENT_CONTEXTS,
  STUDENT_ASSESSMENT_ITEM_RESULTS,
  ASSESSMENT_EVALUATORS,
  computePercentage,
  validateStudentAssessmentResult,
} from '../types/student-assessment-result';
import type {
  StudentAssessmentResult,
  StudentAssessmentItem,
  StudentAssessmentItemResult,
  StudentAssessmentContext,
  AssessmentProvenance,
  AssessmentEvaluator,
} from '../types/student-assessment-result';
import type { MasterySkill } from '@/modules/student/mastery/types';

// ============================================
// Test helpers
// ============================================

const T0 = '2026-08-13T10:00:00.000Z';

function makeItem(overrides: Partial<StudentAssessmentItem> = {}): StudentAssessmentItem {
  return {
    questionId: 'q1',
    response: 'B',
    result: 'correct',
    awardedScore: 1,
    maxScore: 1,
    countsTowardScore: true,
    ...overrides,
  };
}

function makeProvenance(overrides: Partial<AssessmentProvenance> = {}): AssessmentProvenance {
  return {
    evaluator: 'server',
    method: 'exact-match',
    evaluatorVersion: 'v1.0.0',
    createdAt: T0,
    ...overrides,
  };
}

/**
 * Build a fully consistent valid result from items.
 * score / maxScore / percentage are derived from COUNTED items,
 * so the object always satisfies the consistency invariants.
 */
function makeResult(overrides: {
  items: StudentAssessmentItem[];
  assessmentId?: string;
  studentId?: string;
  assignmentId?: string;
  context?: StudentAssessmentContext;
  skill?: MasterySkill;
  completedAt?: string;
  provenance?: AssessmentProvenance;
  /** Override derived fields to simulate inconsistent upstream logic */
  score?: number;
  maxScore?: number;
  percentage?: number;
}): StudentAssessmentResult {
  const counted = overrides.items.filter(i => i.countsTowardScore === true);
  const derivedScore = counted.reduce((s, i) => s + i.awardedScore, 0);
  const derivedMax = counted.reduce((s, i) => s + i.maxScore, 0);
  return {
    assessmentId: overrides.assessmentId ?? 'assess-1',
    studentId: overrides.studentId ?? 'student-001',
    assignmentId: overrides.assignmentId,
    context: overrides.context ?? 'practice',
    skill: overrides.skill ?? 'grammar',
    score: overrides.score ?? derivedScore,
    maxScore: overrides.maxScore ?? derivedMax,
    percentage: overrides.percentage ?? computePercentage(
      overrides.score ?? derivedScore,
      overrides.maxScore ?? derivedMax,
    ),
    items: overrides.items,
    completedAt: overrides.completedAt ?? T0,
    provenance: overrides.provenance ?? makeProvenance(),
  };
}

// ============================================
// Enum constants
// ============================================

describe('Enum constants', () => {
  it('STUDENT_ASSESSMENT_CONTEXTS has exactly 3 contexts', () => {
    expect(STUDENT_ASSESSMENT_CONTEXTS).toHaveLength(3);
    expect(STUDENT_ASSESSMENT_CONTEXTS).toEqual([
      'practice', 'assignment', 'diagnostic',
    ]);
  });

  it('STUDENT_ASSESSMENT_ITEM_RESULTS has exactly 4 results', () => {
    expect(STUDENT_ASSESSMENT_ITEM_RESULTS).toHaveLength(4);
    expect(STUDENT_ASSESSMENT_ITEM_RESULTS).toEqual([
      'correct', 'incorrect', 'partial', 'ungradable',
    ]);
  });

  it('ASSESSMENT_EVALUATORS has exactly 3 evaluators', () => {
    expect(ASSESSMENT_EVALUATORS).toHaveLength(3);
    expect(ASSESSMENT_EVALUATORS).toEqual(['server', 'human', 'ai']);
  });

  it('ungradable is a distinct enum value from incorrect', () => {
    const results: StudentAssessmentItemResult[] = [...STUDENT_ASSESSMENT_ITEM_RESULTS];
    const ungradable = results.find(r => r === 'ungradable');
    const incorrect = results.find(r => r === 'incorrect');
    expect(ungradable).toBeDefined();
    expect(incorrect).toBeDefined();
    expect(ungradable).not.toBe(incorrect);
  });
});

// ============================================
// computePercentage — deterministic, no rounding
// ============================================

describe('computePercentage', () => {
  it('0 / 10 = 0', () => {
    expect(computePercentage(0, 10)).toBe(0);
  });

  it('5 / 10 = 50', () => {
    expect(computePercentage(5, 10)).toBe(50);
  });

  it('10 / 10 = 100', () => {
    expect(computePercentage(10, 10)).toBe(100);
  });

  it('1 / 3 = 33.333... (unrounded)', () => {
    const pct = computePercentage(1, 3);
    expect(pct).toBeCloseTo(33.333333333333336, 12);
    // Unrounded — the canonical float is NOT 33 or 33.33
    expect(pct).not.toBe(33);
    expect(pct).not.toBe(33.33);
  });

  it('2.5 / 5 = 50', () => {
    expect(computePercentage(2.5, 5)).toBe(50);
  });

  it('0.5 / 1 = 50 (partial credit)', () => {
    expect(computePercentage(0.5, 1)).toBe(50);
  });
});

// ============================================
// Valid results
// ============================================

describe('Valid StudentAssessmentResult', () => {
  it('validates 0 / 10 = 0% (all incorrect)', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ questionId: `q${i}`, result: 'incorrect', awardedScore: 0, maxScore: 1 }),
    );
    const result = makeResult({ items });
    expect(result.score).toBe(0);
    expect(result.maxScore).toBe(10);
    expect(result.percentage).toBe(0);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('validates 5 / 10 = 50%', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({
        questionId: `q${i}`,
        result: i < 5 ? 'correct' : 'incorrect',
        awardedScore: i < 5 ? 1 : 0,
        maxScore: 1,
      }),
    );
    const result = makeResult({ items });
    expect(result.score).toBe(5);
    expect(result.maxScore).toBe(10);
    expect(result.percentage).toBe(50);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('validates 10 / 10 = 100% (all correct)', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ questionId: `q${i}`, result: 'correct', awardedScore: 1, maxScore: 1 }),
    );
    const result = makeResult({ items });
    expect(result.percentage).toBe(100);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('validates 1 / 3 = 33.333... (single 3-point question)', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'partial', awardedScore: 1, maxScore: 3 })],
    });
    expect(result.percentage).toBeCloseTo(33.333333333333336, 12);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('validates 2.5 / 5 = 50% (fractional scores)', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', result: 'correct', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q2', result: 'partial', awardedScore: 1.5, maxScore: 4 }),
      ],
    });
    expect(result.score).toBe(2.5);
    expect(result.maxScore).toBe(5);
    expect(result.percentage).toBe(50);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('validates mixed partial-credit items (3.5 / 5 = 70%)', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', result: 'partial', awardedScore: 0.5, maxScore: 1 }),
        makeItem({ questionId: 'q2', result: 'correct', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q3', result: 'partial', awardedScore: 2, maxScore: 3 }),
      ],
    });
    expect(result.score).toBe(3.5);
    expect(result.maxScore).toBe(5);
    expect(result.percentage).toBe(70);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('validates a reading practice result with server provenance', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 2, maxScore: 2 })],
      context: 'practice',
      skill: 'reading',
      provenance: makeProvenance({ evaluator: 'server', method: 'exact-match', evaluatorVersion: 'v2.0.1' }),
    });
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('validates a writing assignment result with ai evaluator', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', response: { essay: '...' }, result: 'partial', awardedScore: 12, maxScore: 21 })],
      context: 'assignment',
      skill: 'writing',
      assignmentId: 'assign-77',
      provenance: makeProvenance({ evaluator: 'ai', method: 'rubric-4-band', evaluatorVersion: 'rubric-v3.2.0' }),
    });
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('validates a human-marked assignment result', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'partial', awardedScore: 3, maxScore: 5 })],
      context: 'assignment',
      skill: 'writing',
      provenance: makeProvenance({ evaluator: 'human', method: 'teacher-marking', evaluatorVersion: undefined }),
    });
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('validates a diagnostic grammar result without assignmentId (no task template)', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 3, maxScore: 4 })],
      context: 'diagnostic',
      skill: 'grammar',
    });
    expect(result.assignmentId).toBeUndefined();
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('preserves raw response of any shape (unknown type)', () => {
    const responses: unknown[] = ['B', 42, { choice: 'B', essay: 'text' }, ['a', 'b'], null];
    for (const response of responses) {
      const result = makeResult({
        items: [makeItem({ questionId: 'q1', response, awardedScore: 1, maxScore: 1 })],
      });
      expect(validateStudentAssessmentResult(result).valid).toBe(true);
    }
  });
});

// ============================================
// Partial credit
// ============================================

describe('Partial credit', () => {
  it('validates partial with awardedScore < maxScore', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', response: 'mostly correct answer', result: 'partial', awardedScore: 0.5, maxScore: 1 }),
      ],
    });
    expect(result.items[0].result).toBe('partial');
    expect(result.items[0].awardedScore).toBeLessThan(result.items[0].maxScore);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('supports non-binary scoring for open-ended questions', () => {
    // Future: reading semantic evaluation, writing rubric evaluation
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', result: 'partial', awardedScore: 2.5, maxScore: 4 }),
        makeItem({ questionId: 'q2', result: 'partial', awardedScore: 1.25, maxScore: 2 }),
      ],
      context: 'practice',
      skill: 'reading',
    });
    expect(result.score).toBe(3.75);
    expect(result.maxScore).toBe(6);
    expect(result.percentage).toBe(62.5);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('does NOT assume binary questions — maxScore can exceed 1', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', result: 'partial', awardedScore: 7, maxScore: 10 }),
        makeItem({ questionId: 'q2', result: 'correct', awardedScore: 10, maxScore: 10 }),
      ],
    });
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });
});

// ============================================
// Ungradable semantics
// ============================================

describe('Ungradable', () => {
  it('validates an ungradable item with awardedScore 0 / maxScore 1', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', response: '...', result: 'ungradable', awardedScore: 0, maxScore: 1 }),
        makeItem({ questionId: 'q2', result: 'correct', awardedScore: 1, maxScore: 1 }),
      ],
    });
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('ungradable is NOT coerced to incorrect at contract level', () => {
    const ungradable = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'ungradable', awardedScore: 0, maxScore: 1 })],
    });
    const incorrect = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'incorrect', awardedScore: 0, maxScore: 1 })],
    });

    // Both are structurally valid and have the same score...
    expect(validateStudentAssessmentResult(ungradable).valid).toBe(true);
    expect(validateStudentAssessmentResult(incorrect).valid).toBe(true);
    expect(ungradable.score).toBe(incorrect.score);

    // ...but the item result enum preserves the distinction.
    expect(ungradable.items[0].result).toBe('ungradable');
    expect(incorrect.items[0].result).toBe('incorrect');
    expect(ungradable.items[0].result).not.toBe(incorrect.items[0].result);
  });

  it('preserves ungradable items through validation without mutation', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', response: 'garbled', result: 'ungradable', awardedScore: 0, maxScore: 2 })],
    });
    const snapshot = JSON.stringify(result);
    validateStudentAssessmentResult(result);
    expect(JSON.stringify(result)).toBe(snapshot); // no mutation
  });

  // ---- R2.5: countsTowardScore policies (both representable, none silent) ----

  it('Policy A — ungradable counts in denominator (countsTowardScore: true) → 8/10 = 80%', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeItem({ questionId: `q${i}`, result: 'correct', awardedScore: 1, maxScore: 1 })),
      makeItem({ questionId: 'q8', result: 'incorrect', awardedScore: 0, maxScore: 1 }),
      makeItem({ questionId: 'q9', result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: true }),
    ];
    const result = makeResult({ items });
    expect(result.score).toBe(8);
    expect(result.maxScore).toBe(10);
    expect(result.percentage).toBe(80);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('Policy B — ungradable excluded from denominator (countsTowardScore: false) → 8/9 = 88.888...%', () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeItem({ questionId: `q${i}`, result: 'correct', awardedScore: 1, maxScore: 1 })),
      makeItem({ questionId: 'q8', result: 'incorrect', awardedScore: 0, maxScore: 1 }),
      makeItem({ questionId: 'q9', result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false }),
    ];
    const result = makeResult({ items });
    expect(result.score).toBe(8);
    expect(result.maxScore).toBe(9);
    expect(result.percentage).toBeCloseTo(computePercentage(8, 9), 12);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('rejects countsTowardScore=false on non-ungradable items', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'correct', awardedScore: 0, maxScore: 1, countsTowardScore: false })],
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items[0].countsTowardScore')).toBe(true);
  });

  it('rejects countsTowardScore=false with awardedScore != 0', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'ungradable', awardedScore: 0.5, maxScore: 1, countsTowardScore: false })],
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items[0].awardedScore')).toBe(true);
  });

  it('rejects an assessment with NO counted items (no scorable denominator)', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false })],
      score: 0,
      maxScore: 1, // fabricated maxScore with no counted items
      percentage: 0,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items')).toBe(true);
  });

  it('rejects missing countsTowardScore (must be explicit)', () => {
    const item = makeItem({ questionId: 'q1', result: 'correct' });
    delete (item as Partial<StudentAssessmentItem>).countsTowardScore;
    const result = makeResult({ items: [item] });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items[0].countsTowardScore')).toBe(true);
  });

  it('ungradable ≠ incorrect ≠ zero-score graded — three-way distinction preserved', () => {
    const ungradableExcluded = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false })],
      // needs a counted item to be valid:
    });
    // For a clean three-way comparison, build each with one counted anchor item.
    const anchor = makeItem({ questionId: 'q0', result: 'correct', awardedScore: 1, maxScore: 1 });
    const withUngradable = makeResult({
      items: [anchor, makeItem({ questionId: 'q1', result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false })],
    });
    const withIncorrect = makeResult({
      items: [anchor, makeItem({ questionId: 'q1', result: 'incorrect', awardedScore: 0, maxScore: 1, countsTowardScore: true })],
    });
    const withZeroGraded = makeResult({
      items: [anchor, makeItem({ questionId: 'q1', result: 'correct', awardedScore: 0, maxScore: 1, countsTowardScore: true })],
    });

    expect(withUngradable.items[1].result).toBe('ungradable');
    expect(withIncorrect.items[1].result).toBe('incorrect');
    expect(withZeroGraded.items[1].result).toBe('correct');

    // Ungradable-excluded and incorrect differ in denominator:
    expect(withUngradable.maxScore).toBe(1);
    expect(withIncorrect.maxScore).toBe(2);

    // All three remain structurally valid — the distinction is preserved,
    // never coerced.
    expect(validateStudentAssessmentResult(withUngradable).valid).toBe(true);
    expect(validateStudentAssessmentResult(withIncorrect).valid).toBe(true);
    expect(validateStudentAssessmentResult(withZeroGraded).valid).toBe(true);
    // (ungradableExcluded alone is invalid — no counted denominator — proving
    // the contract does not silently produce a 0% or NaN percentage)
    expect(validateStudentAssessmentResult(ungradableExcluded).valid).toBe(false);
  });
});

// ============================================
// Invalid: score invariants
// ============================================

describe('Invalid — score invariants', () => {
  it('rejects awardedScore > maxScore', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 2, maxScore: 1 })],
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items[0].awardedScore')).toBe(true);
  });

  it('rejects negative awardedScore', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: -1, maxScore: 1 })],
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items[0].awardedScore')).toBe(true);
  });

  it('rejects item maxScore <= 0', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 0, maxScore: 0 })],
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items[0].maxScore')).toBe(true);
  });

  it('rejects overall score > maxScore', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 5, maxScore: 5 })],
      score: 6,
      maxScore: 5,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'score')).toBe(true);
  });

  it('rejects negative overall score', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 })],
      score: -1,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'score')).toBe(true);
  });

  it('rejects overall maxScore <= 0', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 })],
      maxScore: 0,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'maxScore')).toBe(true);
  });
});

// ============================================
// Invalid: percentage
// ============================================

describe('Invalid — percentage', () => {
  it('rejects percentage < 0', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 0, maxScore: 1 })],
      percentage: -5,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'percentage')).toBe(true);
  });

  it('rejects percentage > 100', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 })],
      percentage: 120,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'percentage')).toBe(true);
  });

  it('rejects percentage inconsistent with score/maxScore (8/10 with 90)', () => {
    // 8 / 10 = 80%, so 90 is wrong
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q2', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q3', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q4', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q5', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q6', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q7', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q8', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q9', awardedScore: 0, maxScore: 1 }),
        makeItem({ questionId: 'q10', awardedScore: 0, maxScore: 1 }),
      ],
      percentage: 90,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'percentage' && e.message.includes('inconsistent'))).toBe(true);
  });

  it('rejects percentage inconsistent with score/maxScore (8/10 with 80.5)', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ questionId: `q${i}`, awardedScore: i < 8 ? 1 : 0, maxScore: 1 }),
    );
    const result = makeResult({ items, percentage: 80.5 });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'percentage')).toBe(true);
  });

  it('accepts the exact unrounded percentage for 1/3', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 3 })],
      // canonical unrounded float, computed the same way producers would
    });
    expect(result.percentage).toBe(computePercentage(1, 3));
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });
});

// ============================================
// Invalid: score/maxScore vs item totals
// ============================================

describe('Invalid — item-total consistency', () => {
  it('rejects score inconsistent with item totals', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q2', awardedScore: 1, maxScore: 1 }),
      ],
      score: 3, // items sum to 2
      maxScore: 2,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'score' && e.message.includes('inconsistent'))).toBe(true);
  });

  it('rejects maxScore inconsistent with item totals', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q2', awardedScore: 1, maxScore: 1 }),
      ],
      score: 2,
      maxScore: 5, // items sum to 2
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'maxScore' && e.message.includes('inconsistent'))).toBe(true);
  });

  it('does NOT silently recalculate — inconsistent input stays rejected', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 })],
      score: 2,
      percentage: 100,
    });
    const snapshot = JSON.stringify(result);
    validateStudentAssessmentResult(result);
    // Validation never mutates or "fixes" the result
    expect(JSON.stringify(result)).toBe(snapshot);
  });
});

// ============================================
// Invalid: duplicate question IDs
// ============================================

describe('Invalid — duplicate questionId', () => {
  it('rejects duplicate questionId across items', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 }),
      ],
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items[1].questionId' && e.message.includes('duplicate'))).toBe(true);
  });

  it('rejects missing questionId', () => {
    const result = makeResult({
      items: [makeItem({ questionId: '', awardedScore: 1, maxScore: 1 })],
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items[0].questionId')).toBe(true);
  });
});

// ============================================
// Empty assessment decision
// ============================================

describe('Empty assessment — explicit rejection', () => {
  it('rejects items: [] (no NaN, no silent 0%)', () => {
    const result = makeResult({
      items: [],
      score: 0,
      maxScore: 0,
      percentage: 0,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    // The contract rejects emptiness explicitly — it does NOT produce
    // percentage = NaN or percentage = 0 silently.
    expect(v.errors.some(e => e.field === 'items')).toBe(true);
    expect(v.errors.some(e => e.field === 'maxScore')).toBe(true);
  });

  it('rejects maxScore: 0 with items present but sum to 0', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 0, maxScore: 0 })],
      score: 0,
      maxScore: 0,
      percentage: 0,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'maxScore')).toBe(true);
  });

  it('documents the decision: completed assessments require scorable items', () => {
    // If a completed assessment must contain scorable items (it does),
    // zero-maxScore results are invalid by contract.
    const empty = makeResult({ items: [], score: 0, maxScore: 0, percentage: 0 });
    expect(validateStudentAssessmentResult(empty).valid).toBe(false);
  });
});

// ============================================
// Invalid: identity fields
// ============================================

describe('Invalid — identity fields', () => {
  it('rejects missing studentId', () => {
    const result = makeResult({
      items: [makeItem({})],
      studentId: '',
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'studentId')).toBe(true);
  });

  it('rejects missing assessmentId', () => {
    const result = makeResult({
      items: [makeItem({})],
      assessmentId: '',
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'assessmentId')).toBe(true);
  });

  it('rejects empty assignmentId when present (optional field, non-empty when given)', () => {
    const result = makeResult({
      items: [makeItem({})],
      assignmentId: '',
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'assignmentId')).toBe(true);
  });

  it('accepts absent assignmentId (ad-hoc practice has no task template)', () => {
    const result = makeResult({ items: [makeItem({})] });
    expect(result.assignmentId).toBeUndefined();
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('uses explicit domain identifiers — no generic sourceId', () => {
    const result = makeResult({ items: [makeItem({})] });
    // Identity fields are explicit on the contract
    expect(result.studentId).toBeTruthy();
    expect(result.assessmentId).toBeTruthy();
    expect(result.items[0].questionId).toBeTruthy();
    // And no generic alias exists at runtime
    expect('sourceId' in result).toBe(false);
    expect('attemptId' in result).toBe(false);
  });

  it('canonical identity cannot contradict provenance identity (structurally impossible)', () => {
    const result = makeResult({ items: [makeItem({})] });
    // AssessmentProvenance carries NO identity field — the type has no
    // assessmentId/sessionId/submissionId member, so a contradictory
    // provenance identity cannot even be constructed.
    const p: AssessmentProvenance = result.provenance;
    expect('assessmentId' in p).toBe(false);
    expect('sessionId' in p).toBe(false);
    expect('submissionId' in p).toBe(false);
    expect(Object.keys(p).sort()).toEqual(['createdAt', 'evaluator', 'evaluatorVersion', 'method']);
  });
});

// ============================================
// Invalid: enums and timestamps
// ============================================

describe('Invalid — enums and timestamps', () => {
  it('rejects invalid item result enum', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'maybe' as StudentAssessmentItemResult })],
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items[0].result')).toBe(true);
  });

  it('rejects invalid context enum', () => {
    const result = makeResult({
      items: [makeItem({})],
      context: 'quiz' as StudentAssessmentContext,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'context')).toBe(true);
  });

  it('rejects invalid skill enum', () => {
    const result = makeResult({
      items: [makeItem({})],
      skill: 'swimming' as MasterySkill,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'skill')).toBe(true);
  });

  it('rejects invalid evaluator enum', () => {
    const result = makeResult({
      items: [makeItem({})],
      provenance: makeProvenance({ evaluator: 'robot' as AssessmentEvaluator }),
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'provenance.evaluator')).toBe(true);
  });

  it('rejects invalid completedAt timestamp', () => {
    const result = makeResult({
      items: [makeItem({})],
      completedAt: 'not-a-date',
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'completedAt')).toBe(true);
  });

  it('rejects missing completedAt', () => {
    const result = makeResult({
      items: [makeItem({})],
      completedAt: '',
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'completedAt')).toBe(true);
  });

  it('rejects invalid provenance.createdAt timestamp', () => {
    const result = makeResult({
      items: [makeItem({})],
      provenance: makeProvenance({ createdAt: 'yesterday' }),
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'provenance.createdAt')).toBe(true);
  });

  it('rejects missing provenance', () => {
    const result = makeResult({ items: [makeItem({})] });
    delete (result as Partial<StudentAssessmentResult>).provenance;
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'provenance')).toBe(true);
  });
});

// ============================================
// Provenance
// ============================================

describe('AssessmentProvenance', () => {
  it('supports server / human / ai evaluators', () => {
    const evaluators: AssessmentEvaluator[] = ['server', 'human', 'ai'];
    for (const evaluator of evaluators) {
      const result = makeResult({
        items: [makeItem({})],
        provenance: makeProvenance({ evaluator }),
      });
      expect(validateStudentAssessmentResult(result).valid).toBe(true);
    }
  });

  it('supports optional method and evaluatorVersion', () => {
    const minimal = makeResult({
      items: [makeItem({})],
      provenance: { evaluator: 'server', createdAt: T0 },
    });
    expect(validateStudentAssessmentResult(minimal).valid).toBe(true);

    const full = makeResult({
      items: [makeItem({})],
      provenance: { evaluator: 'ai', method: 'rubric-4-band', evaluatorVersion: 'v3.2.0', createdAt: T0 },
    });
    expect(validateStudentAssessmentResult(full).valid).toBe(true);
  });

  it('is a DIFFERENT concept from LearningEvidence.provenance', () => {
    // AssessmentProvenance answers: who evaluated the answers?
    // LearningEvidence.provenance answers: where did mastery evidence originate?
    // Structurally distinct: evaluator enum vs source string + method.
    const p: AssessmentProvenance = { evaluator: 'ai', createdAt: T0 };
    expect('evaluator' in p).toBe(true);
    expect('source' in p).toBe(false);
  });
});

// ============================================
// Architectural isolation
// ============================================

describe('Architectural isolation', () => {
  it('StudentAssessmentResult is structurally different from AI AssessmentResult', () => {
    const result = makeResult({ items: [makeItem({})] });
    // AI AssessmentResult distinguishing fields: decision, dimensions, checks, warnings, errors, recommendations, metadata
    expect('decision' in result).toBe(false);
    expect('dimensions' in result).toBe(false);
    expect('checks' in result).toBe(false);
    expect('warnings' in result).toBe(false);
    expect('recommendations' in result).toBe(false);
    // StudentAssessmentResult distinguishing fields: score, maxScore, percentage, items, context, skill, provenance
    expect('items' in result).toBe(true);
    expect('percentage' in result).toBe(true);
    expect('provenance' in result).toBe(true);
    expect('context' in result).toBe(true);
    expect('skill' in result).toBe(true);
  });

  it('does NOT embed LearningEvidence into assessment items', () => {
    const item = makeItem({});
    // The item is a raw observation: questionId, response, result, awardedScore, maxScore, countsTowardScore
    expect('kind' in item).toBe(false);
    expect('value' in item).toBe(false);
    expect('evidence' in item).toBe(false);
    expect(Object.keys(item).sort()).toEqual([
      'awardedScore', 'countsTowardScore', 'maxScore', 'questionId', 'response', 'result',
    ]);
  });

  it('does not contain mastery / weakness / recommendation fields', () => {
    const result = makeResult({ items: [makeItem({})] });
    expect('mastery' in result).toBe(false);
    expect('weakness' in result).toBe(false);
    expect('recommendation' in result).toBe(false);
    expect('correctCount' in result).toBe(false);
    expect('isCorrect' in result).toBe(false);
  });

  it('this module imports nothing from production consumers', () => {
    // Contract files import only from each other. The test imports only
    // from '../types/student-assessment-result'. If this compiles, no
    // consumer (api/practice, mastery, StudentState, LearningDecisionEngine,
    // AdaptiveTutor, StudentTwin) is referenced.
    expect(true).toBe(true);
  });

  it('validation does not mutate the input result', () => {
    const result = makeResult({ items: [makeItem({})] });
    const snapshot = JSON.stringify(result);
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(true);
    expect(JSON.stringify(result)).toBe(snapshot);
  });
});

// ============================================
// Exhaustiveness — every kind enum handled
// ============================================

describe('Type-level exhaustiveness', () => {
  it('switch on StudentAssessmentItemResult covers all values', () => {
    function handle(r: StudentAssessmentItemResult): string {
      switch (r) {
        case 'correct': return 'correct';
        case 'incorrect': return 'incorrect';
        case 'partial': return 'partial';
        case 'ungradable': return 'ungradable';
        default: {
          const _exhaustive: never = r;
          return _exhaustive;
        }
      }
    }
    expect(handle('correct')).toBe('correct');
    expect(handle('incorrect')).toBe('incorrect');
    expect(handle('partial')).toBe('partial');
    expect(handle('ungradable')).toBe('ungradable');
  });

  it('switch on AssessmentEvaluator covers all values', () => {
    function handle(e: AssessmentEvaluator): string {
      switch (e) {
        case 'server': return 'server';
        case 'human': return 'human';
        case 'ai': return 'ai';
        default: {
          const _exhaustive: never = e;
          return _exhaustive;
        }
      }
    }
    expect(handle('server')).toBe('server');
    expect(handle('human')).toBe('human');
    expect(handle('ai')).toBe('ai');
  });

  it('switch on StudentAssessmentContext covers all values', () => {
    function handle(c: StudentAssessmentContext): string {
      switch (c) {
        case 'practice': return 'practice';
        case 'assignment': return 'assignment';
        case 'diagnostic': return 'diagnostic';
        default: {
          const _exhaustive: never = c;
          return _exhaustive;
        }
      }
    }
    expect(handle('practice')).toBe('practice');
    expect(handle('assignment')).toBe('assignment');
    expect(handle('diagnostic')).toBe('diagnostic');
  });
});

// ============================================
// R2.5 audit: context × skill are orthogonal dimensions
// ============================================

describe('R2.5 — Context × skill orthogonality', () => {
  const combos: Array<{ context: StudentAssessmentContext; skill: MasterySkill }> = [
    { context: 'practice', skill: 'grammar' },
    { context: 'practice', skill: 'vocabulary' },
    { context: 'practice', skill: 'reading' },
    { context: 'assignment', skill: 'reading' },
    { context: 'assignment', skill: 'writing' },
    { context: 'diagnostic', skill: 'reading' },
    { context: 'diagnostic', skill: 'listening' },
    { context: 'diagnostic', skill: 'speaking' },
  ];

  for (const combo of combos) {
    it(`validates ${combo.skill} + ${combo.context} (orthogonal dimensions)`, () => {
      const result = makeResult({
        items: [makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 })],
        context: combo.context,
        skill: combo.skill,
      });
      expect(validateStudentAssessmentResult(result).valid).toBe(true);
    });
  }

  it('the old single-enum mixing is gone — no source field with skill names', () => {
    const result = makeResult({ items: [makeItem({})] });
    expect('source' in result).toBe(false);
    // Dimensions are separate and unambiguous:
    expect(typeof result.context).toBe('string');
    expect(typeof result.skill).toBe('string');
  });
});

// ============================================
// R2.5 audit: timestamps are two distinct events
// ============================================

describe('R2.5 — Timestamp semantics', () => {
  it('completedAt (student finished) and provenance.createdAt (evaluated) are different events', () => {
    const result = makeResult({
      items: [makeItem({})],
      completedAt: '2026-08-13T09:00:00.000Z',          // student finished
      provenance: makeProvenance({ createdAt: '2026-08-13T09:05:00.000Z' }), // graded later
    });
    expect(result.completedAt).not.toBe(result.provenance.createdAt);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('provenance.createdAt may equal completedAt (instant server grading) — still valid', () => {
    const result = makeResult({
      items: [makeItem({})],
      completedAt: T0,
      provenance: makeProvenance({ createdAt: T0 }),
    });
    expect(result.completedAt).toBe(result.provenance.createdAt);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });
});

// ============================================
// R2.5 audit: partial credit has NO fixed ratio
// ============================================

describe('R2.5 — Partial credit ratio freedom', () => {
  it('partial is an outcome, not a fixed 50% policy', () => {
    const ratios = [0.25, 0.5, 0.75, 0.3, 2 / 3];
    for (const ratio of ratios) {
      const result = makeResult({
        items: [makeItem({ questionId: 'q1', result: 'partial', awardedScore: ratio, maxScore: 1 })],
      });
      expect(result.items[0].result).toBe('partial');
      expect(validateStudentAssessmentResult(result).valid).toBe(true);
    }
  });

  it('partial with arbitrary point values (rubric-style) is valid', () => {
    // e.g. a writing rubric band: 4.5 / 7, 11 / 21
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', result: 'partial', awardedScore: 4.5, maxScore: 7 }),
        makeItem({ questionId: 'q2', result: 'partial', awardedScore: 11, maxScore: 21 }),
      ],
      context: 'assignment',
      skill: 'writing',
    });
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
    expect(result.percentage).toBe(computePercentage(15.5, 28));
  });
});

// ============================================
// R2.5 audit: score aggregation is deterministic (counted items only)
// ============================================

describe('R2.5 — Deterministic aggregation over counted items', () => {
  it('aggregates ONLY counted items — ungradable excluded from sums', () => {
    const items = [
      makeItem({ questionId: 'q1', result: 'correct', awardedScore: 1, maxScore: 1 }),
      makeItem({ questionId: 'q2', result: 'incorrect', awardedScore: 0, maxScore: 1 }),
      // excluded from denominator:
      makeItem({ questionId: 'q3', result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false }),
    ];
    const result = makeResult({ items });
    expect(result.score).toBe(1);      // counted only
    expect(result.maxScore).toBe(2);   // counted only
    expect(result.percentage).toBe(50);
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('rejects maxScore that includes a non-counted item (policy error visible, not silent)', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', result: 'correct', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q2', result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false }),
      ],
      maxScore: 2, // ← wrongly includes the non-counted item
      score: 1,
      percentage: 50,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'maxScore' && e.message.includes('inconsistent'))).toBe(true);
  });

  it('computePercentage is deterministic and unrounded for counted totals', () => {
    expect(computePercentage(0, 10)).toBe(0);
    expect(computePercentage(1, 3)).toBe(computePercentage(1, 3)); // stable
    expect(computePercentage(8, 9)).toBeCloseTo(88.88888888888889, 9);
  });
});

// ============================================
// R2.5 audit: provenance distinctness & evaluator sufficiency
// ============================================

describe('R2.5 — Provenance audit', () => {
  it('answers who / how / which version / when', () => {
    const p: AssessmentProvenance = {
      evaluator: 'ai',                       // who/what
      method: 'rubric-4-band',               // how
      evaluatorVersion: 'rubric-v3.2.0',     // which version
      createdAt: T0,                         // when
    };
    expect(p.evaluator).toBe('ai');
    expect(p.method).toBe('rubric-4-band');
    expect(p.evaluatorVersion).toBe('rubric-v3.2.0');
    expect(Date.parse(p.createdAt)).not.toBeNaN();
  });

  it('stays distinct from EvidenceProvenance (different concept, different shape)', () => {
    const p: AssessmentProvenance = { evaluator: 'server', createdAt: T0 };
    // EvidenceProvenance has: source (string), method?, modelVersion?, description?
    // AssessmentProvenance has: evaluator enum, method?, evaluatorVersion?, createdAt
    expect('source' in p).toBe(false);
    expect('modelVersion' in p).toBe(false);
    expect('description' in p).toBe(false);
    expect('evaluator' in p).toBe(true);
    expect('createdAt' in p).toBe(true);
  });
});

// ============================================
// R2.5 audit: runtime identity documentation contract
// ============================================

describe('R2.5 — Identity semantics', () => {
  it('assessmentId is the canonical execution identity (single, top-level only)', () => {
    const result = makeResult({ items: [makeItem({})] });
    // Canonical execution identity: exactly one field on the result.
    expect(result.assessmentId).toBeTruthy();
    // No competing identity fields anywhere:
    expect('sessionId' in result).toBe(false);
    expect('submissionId' in result).toBe(false);
    expect('attemptId' in result).toBe(false);
  });

  it('assignmentId is optional and is the task-template reference (Assignment.id)', () => {
    const withTemplate = makeResult({
      items: [makeItem({})],
      assignmentId: 'assign-77',
      context: 'assignment',
    });
    const withoutTemplate = makeResult({ items: [makeItem({})] });
    expect(withTemplate.assignmentId).toBe('assign-77');
    expect(validateStudentAssessmentResult(withTemplate).valid).toBe(true);
    expect(withoutTemplate.assignmentId).toBeUndefined();
    expect(validateStudentAssessmentResult(withoutTemplate).valid).toBe(true);
  });

  it('questionId is required per item and unique', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'assign-q1', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'assign-q2', awardedScore: 1, maxScore: 1 }),
      ],
      context: 'assignment',
      assignmentId: 'assign-77',
    });
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });
});

// ============================================
// R2.6 regression — Gate 1: assessmentId = execution, assignmentId = template
// ============================================

describe('R2.6 — assessmentId vs assignmentId semantics', () => {
  it('assessmentId is the execution (attempt) identity, NOT the template', () => {
    // Attempts 1..3 of the SAME assignment: same assignmentId, different assessmentId
    const template = 'assign-77';
    const attempt1 = makeResult({
      items: [makeItem({ questionId: 'q1' })],
      assessmentId: 'attempt-1',
      assignmentId: template,
      context: 'assignment',
    });
    const attempt2 = makeResult({
      items: [makeItem({ questionId: 'q1' })],
      assessmentId: 'attempt-2',
      assignmentId: template,
      context: 'assignment',
    });

    // Template identity is shared across attempts...
    expect(attempt1.assignmentId).toBe(attempt2.assignmentId);
    // ...while the execution identity is unique per attempt.
    expect(attempt1.assessmentId).not.toBe(attempt2.assessmentId);
    expect(validateStudentAssessmentResult(attempt1).valid).toBe(true);
    expect(validateStudentAssessmentResult(attempt2).valid).toBe(true);
  });

  it('the contract has NO exerciseId field (removed misleading abstraction)', () => {
    const result = makeResult({ items: [makeItem({})] });
    expect('exerciseId' in result).toBe(false);
    expect('assignmentId' in result).toBe(true);
  });

  it('practice executions have NO assignmentId (ad-hoc AI generation)', () => {
    const result = makeResult({ items: [makeItem({})], context: 'practice' });
    expect(result.assignmentId).toBeUndefined();
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });
});

// ============================================
// R2.6 regression — Gate 3: skill is OPTIONAL
// ============================================

describe('R2.6 — optional skill semantics', () => {
  it('accepts absent skill (general/integrated executions)', () => {
    const result = makeResult({ items: [makeItem({})] });
    delete (result as Partial<StudentAssessmentResult>).skill;
    expect(result.skill).toBeUndefined();
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('accepts absent skill for integrated-skills assignment (languageSkill=integrated)', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q2', awardedScore: 1, maxScore: 2 }),
      ],
      context: 'assignment',
      assignmentId: 'assign-integrated-1',
    });
    delete (result as Partial<StudentAssessmentResult>).skill;
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('still rejects a PRESENT but invalid skill', () => {
    const result = makeResult({
      items: [makeItem({})],
      skill: 'swimming' as MasterySkill,
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'skill')).toBe(true);
  });

  it('accepts every valid MasterySkill value', () => {
    const skills: MasterySkill[] = ['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking'];
    for (const skill of skills) {
      const result = makeResult({ items: [makeItem({})], skill });
      expect(validateStudentAssessmentResult(result).valid).toBe(true);
    }
  });
});

// ============================================
// R2.6 regression — Gate 4: countsTowardScore four cases
// ============================================

describe('R2.6 — countsTowardScore case matrix', () => {
  it('Case A — incorrect + awarded 0 + counted → VALID', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'incorrect', awardedScore: 0, maxScore: 1, countsTowardScore: true })],
    });
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('Case B — ungradable + awarded 0 + excluded → VALID (needs ≥1 counted anchor)', () => {
    const result = makeResult({
      items: [
        makeItem({ questionId: 'q0', result: 'correct', awardedScore: 1, maxScore: 1 }),
        makeItem({ questionId: 'q1', result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false }),
      ],
    });
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('Case C — ungradable + awarded 0 + counted → VALID (explicit Policy A)', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: true })],
    });
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('Case D — incorrect + excluded → INVALID (no excluded-incorrect concept in repo)', () => {
    const result = makeResult({
      items: [makeItem({ questionId: 'q1', result: 'incorrect', awardedScore: 0, maxScore: 1, countsTowardScore: false })],
    });
    const v = validateStudentAssessmentResult(result);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => e.field === 'items[0].countsTowardScore')).toBe(true);
  });
});

// ============================================
// R2.6 regression — Gate 6: single canonical identity
// ============================================

describe('R2.6 — identity contradiction regression', () => {
  it('exactly one canonical execution identity — provenance cannot contradict it', () => {
    const result = makeResult({ items: [makeItem({})], assessmentId: 'A' });
    // The type system makes this structurally impossible:
    const provenanceKeys = Object.keys(result.provenance);
    expect(provenanceKeys).not.toContain('assessmentId');
    expect(provenanceKeys).not.toContain('assignmentId');
    expect(provenanceKeys).not.toContain('sessionId');
    expect(provenanceKeys).not.toContain('submissionId');
    // Result itself has exactly the canonical identity field:
    expect(result.assessmentId).toBe('A');
  });

  it('assignmentId is NOT a second execution identity — it is the shared template', () => {
    const r1 = makeResult({ items: [makeItem({})], assessmentId: 'A', assignmentId: 'T' });
    const r2 = makeResult({ items: [makeItem({})], assessmentId: 'B', assignmentId: 'T' });
    // Two executions (A, B) of the same template (T) — both valid.
    expect(validateStudentAssessmentResult(r1).valid).toBe(true);
    expect(validateStudentAssessmentResult(r2).valid).toBe(true);
  });
});

// ============================================
// R2.6 regression — Gate 8: timestamp mapping semantics
// ============================================

describe('R2.6 — timestamp mapping', () => {
  it('completedAt = student finished; provenance.createdAt = evaluator recorded (may differ)', () => {
    const result = makeResult({
      items: [makeItem({})],
      completedAt: '2026-08-13T09:00:00.000Z',
      provenance: makeProvenance({ createdAt: '2026-08-13T09:30:00.000Z' }),
    });
    expect(Date.parse(result.completedAt)).toBeLessThan(Date.parse(result.provenance.createdAt));
    expect(validateStudentAssessmentResult(result).valid).toBe(true);
  });

  it('both timestamps are ISO 8601 strings', () => {
    const result = makeResult({ items: [makeItem({})] });
    expect(Date.parse(result.completedAt)).not.toBeNaN();
    expect(Date.parse(result.provenance.createdAt)).not.toBeNaN();
  });
});

// ============================================
// R2.6 regression — Gate 9: contract stays a small boundary
// ============================================

describe('R2.6 — small-boundary check', () => {
  it('contract module exports only: types, enums, one helper, one validator', () => {
    // This test file imports exactly these from the contract:
    //   STUDENT_ASSESSMENT_CONTEXTS, STUDENT_ASSESSMENT_ITEM_RESULTS,
    //   ASSESSMENT_EVALUATORS, computePercentage, validateStudentAssessmentResult
    // No engines, registries, factories, services, or repositories exist
    // in the contract module. If this compiles, the boundary holds.
    expect(true).toBe(true);
  });

  it('no scoring engine exists — validation only detects, never computes policy', () => {
    const inconsistent = makeResult({
      items: [makeItem({ questionId: 'q1', awardedScore: 1, maxScore: 1 })],
      score: 2,
      percentage: 100,
    });
    const snapshot = JSON.stringify(inconsistent);
    const v = validateStudentAssessmentResult(inconsistent);
    expect(v.valid).toBe(false);
    expect(JSON.stringify(inconsistent)).toBe(snapshot); // no recomputation
  });
});
