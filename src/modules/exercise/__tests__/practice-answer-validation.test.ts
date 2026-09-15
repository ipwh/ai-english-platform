// ============================================
// R3.1–R3.3: Practice Answer Validation & Scorer — Focused Tests
// ============================================
import { describe, it, expect } from 'vitest';
import {
  validatePracticeAnswers,
  computePracticeAggregates,
  PRACTICE_ANSWER_RESULTS,
  type NormalizedPracticeAnswer,
} from '../services/practice-answer-validation';
import { scorePracticeAnswer, checkAnswer, isOpenEndedQuestionType } from '../services/practice-answer-scorer';

/** Minimal valid practice answer (server-scored path) */
function practiceAnswer(overrides: Record<string, unknown> = {}) {
  return {
    questionId: 'q1',
    questionIndex: 0,
    questionType: 'mc',
    studentAnswer: 'B',
    correctAnswer: 'B',
    ...overrides,
  };
}

/** Minimal valid reading answer (deferred client-forwarded path) */
function readingAnswer(overrides: Record<string, unknown> = {}) {
  return {
    questionId: 'rd-1',
    questionIndex: 0,
    dseType: 'multiple_choice',
    studentAnswer: 'x',
    correctAnswer: 'y',
    isCorrect: false,
    result: 'partial',
    awardedScore: 0.5,
    maxScore: 1,
    countsTowardScore: true,
    ...overrides,
  };
}

function expectOk(result: ReturnType<typeof validatePracticeAnswers>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected ok');
  return result.answers;
}

// ============================================
// TEST 1 — Canonical questionId is preserved
// ============================================

describe('TEST 1 — canonical questionId persistence', () => {
  it('preserves the actual PracticeQuestion.id unchanged', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ questionId: 'question-abc', correctAnswer: 'A', studentAnswer: 'A' }),
    ]));
    expect(answers[0].questionId).toBe('question-abc');
    // NOT synthesized from session/questionIndex:
    expect(answers[0].questionId).not.toBe('session-id-q0');
  });

  it('preserves IDs regardless of questionIndex value', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ questionId: 'q-real-1', questionIndex: 7 }),
    ]));
    expect(answers[0].questionId).toBe('q-real-1');
    expect(answers[0].questionIndex).toBe(7);
  });

  it('trims whitespace but never rewrites the ID', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ questionId: '  ai-123-0  ' }),
    ]));
    expect(answers[0].questionId).toBe('ai-123-0');
  });
});

// ============================================
// TEST 2 — Different IDs with same indexes
// ============================================

describe('TEST 2 — same index, different questionIds', () => {
  it('handles two questions with different IDs but same index', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ questionId: 'q-a', questionIndex: 0 }),
      practiceAnswer({ questionId: 'q-b', questionIndex: 0, studentAnswer: 'C', correctAnswer: 'C' }),
    ]));
    expect(answers.map(a => a.questionId)).toEqual(['q-a', 'q-b']);
  });

  it('preserves submission order when indexes are equal', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ questionId: 'first', questionIndex: 3 }),
      practiceAnswer({ questionId: 'second', questionIndex: 3 }),
    ]));
    expect(answers.map(a => a.questionId)).toEqual(['first', 'second']);
  });
});

// ============================================
// TEST 3 / TEST 4 — duplicate & missing questionId
// ============================================

describe('TEST 3/4 — questionId integrity', () => {
  it('rejects duplicate questionId within one submission', () => {
    const result = validatePracticeAnswers([
      practiceAnswer({ questionId: 'q-dup' }),
      practiceAnswer({ questionId: 'q-dup' }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('q-dup');
  });

  it('allows the SAME questionId in DIFFERENT submissions (per-session scope)', () => {
    expect(validatePracticeAnswers([practiceAnswer({ questionId: 'q-same' })]).ok).toBe(true);
    expect(validatePracticeAnswers([practiceAnswer({ questionId: 'q-same' })]).ok).toBe(true);
  });

  it('rejects answers without questionId', () => {
    expect(validatePracticeAnswers([practiceAnswer({ questionId: undefined })]).ok).toBe(false);
  });

  it('rejects empty-string questionId', () => {
    expect(validatePracticeAnswers([practiceAnswer({ questionId: '   ' })]).ok).toBe(false);
  });

  it('rejects non-string questionId', () => {
    expect(validatePracticeAnswers([
      practiceAnswer({ questionId: 123 as unknown as string }),
    ]).ok).toBe(false);
  });
});

// ============================================
// TEST 5 / TEST 6 — Server-authoritative binary scoring
// ============================================

describe('TEST 5/6 — server-authoritative binary scoring', () => {
  it('correct answer → result=correct, awardedScore=1, maxScore=1, countsTowardScore=true, scoredBy=server', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ studentAnswer: 'A', correctAnswer: 'A' }),
    ]));
    const a: NormalizedPracticeAnswer = answers[0];
    expect(a.result).toBe('correct');
    expect(a.awardedScore).toBe(1);
    expect(a.maxScore).toBe(1);
    expect(a.countsTowardScore).toBe(true);
    expect(a.isCorrect).toBe(true);
    expect(a.scoredBy).toBe('server');
    expect(a.scoringMethod).toBe('client-key-deterministic');
  });

  it('incorrect answer → result=incorrect, awardedScore=0, maxScore=1', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ studentAnswer: 'C', correctAnswer: 'B' }),
    ]));
    expect(answers[0].result).toBe('incorrect');
    expect(answers[0].awardedScore).toBe(0);
    expect(answers[0].maxScore).toBe(1);
    expect(answers[0].isCorrect).toBe(false);
  });
});

// ============================================
// R3.3 — Client tampering has no effect (practice path)
// ============================================

describe('R3.3 — client tampering is ignored for practice answers', () => {
  it('forged isCorrect=true on a wrong answer is ignored → incorrect', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ studentAnswer: 'C', correctAnswer: 'B', isCorrect: true }),
    ]));
    expect(answers[0].result).toBe('incorrect');
    expect(answers[0].isCorrect).toBe(false);
  });

  it('forged result=correct + awardedScore=999 + maxScore=1 are ignored → incorrect 0/1', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({
        studentAnswer: 'C', correctAnswer: 'B',
        result: 'correct', awardedScore: 999, maxScore: 1, countsTowardScore: true,
      }),
    ]));
    expect(answers[0].result).toBe('incorrect');
    expect(answers[0].awardedScore).toBe(0);
    expect(answers[0].maxScore).toBe(1);
  });

  it('forged isCorrect=false on a correct answer is ignored → correct', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ studentAnswer: 'B', correctAnswer: 'B', isCorrect: false }),
    ]));
    expect(answers[0].result).toBe('correct');
    expect(answers[0].isCorrect).toBe(true);
  });

  it('server-derived isCorrect drives mistake sync semantics', () => {
    const wrong = expectOk(validatePracticeAnswers([
      practiceAnswer({ studentAnswer: 'C', correctAnswer: 'B', isCorrect: true }),
    ]));
    expect(wrong[0].isCorrect).toBe(false); // auto-synced to mistake book
  });
});

// ============================================
// Scorer — deterministic answer comparison semantics
// ============================================

describe('Scorer — faithful port of checkAnswer semantics', () => {
  it('MC letter match', () => {
    expect(checkAnswer('B', 'B', 'mc')).toBe(true);
    expect(checkAnswer('C', 'B', 'mc')).toBe(false);
  });

  it('MC full-text match via choices', () => {
    const choices = ['She goes to school', 'She go to school', 'She going to school', 'She went to school'];
    expect(checkAnswer('She goes to school', 'A', 'mc', choices)).toBe(true);
    expect(checkAnswer('she  GOES  to school.', 'A', 'mc', choices)).toBe(true);
  });

  it('error-correction with choices is treated as MC', () => {
    const choices = ['that', 'what', 'which', 'who'];
    // correct answer letter A → choice text 'that'
    expect(checkAnswer('that', 'A', 'error-correction', choices)).toBe(true);
    expect(checkAnswer('what', 'A', 'error-correction', choices)).toBe(false);
  });

  it('error-correction arrow semantics (contains correction, not error)', () => {
    expect(checkAnswer('that', 'what → that/which', 'error-correction')).toBe(true);
    expect(checkAnswer('what', 'what → that/which', 'error-correction')).toBe(false);
  });

  it('text answer normalized comparison with number words', () => {
    expect(checkAnswer('fifteen', '15', 'fill-blank')).toBe(true);
    expect(checkAnswer('  went  ', 'went', 'fill-blank')).toBe(true);
  });

  it('single-keyword containment for fill-blank', () => {
    expect(checkAnswer('He went to school', 'went', 'fill-blank')).toBe(true);
  });

  it('scorePracticeAnswer always produces bounded 1-point binary output', () => {
    expect(scorePracticeAnswer({ studentAnswer: 'A', correctAnswer: 'A', questionType: 'mc' }))
      .toEqual({ result: 'correct', awardedScore: 1, maxScore: 1, countsTowardScore: true });
    expect(scorePracticeAnswer({ studentAnswer: 'C', correctAnswer: 'B', questionType: 'mc', choices: ['A', 'B', 'C', 'D'] }))
      .toEqual({ result: 'incorrect', awardedScore: 0, maxScore: 1, countsTowardScore: true });
  });
});

// ============================================
// TEST 7 — R3.7: reading rows are rejected (server scoring required)
// ============================================

describe('TEST 7 — reading client-scored rows rejected (R3.7)', () => {
  it('rejects a client-forwarded partial 0.5/1 reading row', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'partial', awardedScore: 0.5, maxScore: 1 }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('伺服器評分');
  });

  it('rejects a client-forwarded 1/2 reading row', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'partial', awardedScore: 1, maxScore: 2 }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects even correct-looking client-scored reading rows (no client authority)', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'correct', awardedScore: 2, maxScore: 3 }),
    ]);
    expect(result.ok).toBe(false);
  });
});

// ============================================
// TEST 8 — no silent 1/0 conversion (rejection, not conversion)
// ============================================

describe('TEST 8 — real reading scores are never converted (rows rejected)', () => {
  it('rejects 2/3 instead of silently rewriting to 1/1', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'partial', awardedScore: 2, maxScore: 3 }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects fractional marks (1.5 of 4) instead of rewriting', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'partial', awardedScore: 1.5, maxScore: 4 }),
    ]);
    expect(result.ok).toBe(false);
  });
});

// ============================================
// TEST 9 — Auth/ownership untouched
// ============================================

describe('TEST 9 — auth orthogonal to answer validation', () => {
  it('validation is auth-agnostic: studentId is not read or rewritten', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ studentId: 'evil-impersonation' } as never),
    ]));
    expect('studentId' in answers[0]).toBe(false);
  });

  it('result vocabulary matches the frozen contract enum', () => {
    expect(PRACTICE_ANSWER_RESULTS).toEqual(['correct', 'incorrect', 'partial', 'ungradable']);
  });
});

// ============================================
// TEST 10 — Existing functionality unchanged
// ============================================

describe('TEST 10 — existing functionality preserved', () => {
  it('empty answers array is accepted (presence-marker flows)', () => {
    const result = validatePracticeAnswers([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers).toHaveLength(0);
  });

  it('undefined answers is accepted (writing/speaking/integrated presence flows)', () => {
    const result = validatePracticeAnswers(undefined);
    expect(result.ok).toBe(true);
  });

  it('legacy answer shape with full fields normalizes correctly', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({
        questionType: 'fill-blank',
        questionPrompt: 'He ___ (go) to school.',
        studentAnswer: 'goes',
        correctAnswer: 'goes',
        timeSpent: 12,
      }),
    ]));
    expect(answers[0].timeSpent).toBe(12);
    expect(answers[0].questionPrompt).toBe('He ___ (go) to school.');
    expect(answers[0].result).toBe('correct');
  });
});

// ============================================
// Ungradable & scoring invariants (R3.2/R3.3)
// ============================================

describe('Ungradable semantics (no manufacture)', () => {
  it('rejects client-scored ungradable reading rows (server scoring required)', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects client-scored ungradable reading rows counted in denominator', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: true }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects countsTowardScore=false on non-ungradable', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'incorrect', awardedScore: 0, maxScore: 1, countsTowardScore: false }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects excluded item with non-zero awardedScore', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'ungradable', awardedScore: 0.5, maxScore: 1, countsTowardScore: false }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('practice path never manufactures ungradable', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ studentAnswer: '', correctAnswer: 'B' }),
    ]));
    expect(answers[0].result).toBe('incorrect');
    expect(answers[0].result).not.toBe('ungradable');
  });
});

// ============================================
// Score invariant violations
// ============================================

describe('Score invariant violations rejected', () => {
  it('rejects awardedScore > maxScore (reading path)', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'partial', awardedScore: 3, maxScore: 2 }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects maxScore <= 0 (reading path)', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'correct', awardedScore: 0, maxScore: 0 }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects negative awardedScore (reading path)', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'partial', awardedScore: -1, maxScore: 1 }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid result enum (reading path)', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ result: 'maybe', awardedScore: 1, maxScore: 1 }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects reading answer without explicit scores', () => {
    const result = validatePracticeAnswers([
      readingAnswer({ awardedScore: undefined, maxScore: undefined }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects practice answer missing correctAnswer (server cannot score)', () => {
    const result = validatePracticeAnswers([
      practiceAnswer({ correctAnswer: '' }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid questionIndex', () => {
    const result = validatePracticeAnswers([
      practiceAnswer({ questionIndex: -1 }),
    ]);
    expect(result.ok).toBe(false);
  });
});

// ============================================
// Open-ended questions are NOT auto-gradable (2026-09-15)
// ============================================
// A 150-word article must never be compared against the sample answer as if
// the sample were an answer key: 'incorrect' would be a manufactured verdict
// (student report: AI feedback was fine but the score said "回答錯誤").
describe('Open-ended (writing) questions', () => {
  const essay = 'Walking down our neighbourhood streets, the familiar sights of small shops are fading...';
  const sample = 'Small shops are more than places to buy things. They are where neighbours know your name...';

  it('predicate matches only writing types', () => {
    expect(isOpenEndedQuestionType('short-writing')).toBe(true);
    expect(isOpenEndedQuestionType('writing')).toBe(true);
    expect(isOpenEndedQuestionType(' SHORT-WRITING ')).toBe(true);
    expect(isOpenEndedQuestionType('mc')).toBe(false);
    expect(isOpenEndedQuestionType('fill-blank')).toBe(false);
    expect(isOpenEndedQuestionType('error-correction')).toBe(false);
    expect(isOpenEndedQuestionType(undefined)).toBe(false);
    expect(isOpenEndedQuestionType(null)).toBe(false);
  });

  it('scorePracticeAnswer reports ungradable — never incorrect', () => {
    expect(scorePracticeAnswer({ studentAnswer: essay, correctAnswer: sample, questionType: 'short-writing' }))
      .toEqual({ result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false });
    expect(scorePracticeAnswer({ studentAnswer: essay, correctAnswer: sample, questionType: 'writing' }).result)
      .toBe('ungradable');
    // Deterministic types are untouched:
    expect(scorePracticeAnswer({ studentAnswer: 'B', correctAnswer: 'B', questionType: 'mc' }))
      .toEqual({ result: 'correct', awardedScore: 1, maxScore: 1, countsTowardScore: true });
    expect(scorePracticeAnswer({ studentAnswer: 'nope', correctAnswer: 'B', questionType: 'mc' }).result)
      .toBe('incorrect');
  });

  it('legacy validation path yields an excluded ungradable row (valid invariants)', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({
        questionType: 'short-writing',
        questionPrompt: 'Write a 120-150 word article.',
        studentAnswer: essay,
        correctAnswer: sample,
      }),
    ]));
    expect(answers[0]).toMatchObject({
      result: 'ungradable',
      countsTowardScore: false,
      awardedScore: 0,
      maxScore: 1,
      isCorrect: false,
    });
  });

  it('an exact match to the sample answer is still NOT scored correct (no fake grading)', () => {
    const answers = expectOk(validatePracticeAnswers([
      practiceAnswer({ questionType: 'short-writing', studentAnswer: sample, correctAnswer: sample }),
    ]));
    expect(answers[0].result).toBe('ungradable');
  });

  it('aggregates exclude ungradable rows from numerator AND denominator', () => {
    const aggregates = computePracticeAggregates([
      { result: 'correct', countsTowardScore: true },
      { result: 'incorrect', countsTowardScore: true },
      { result: 'ungradable', countsTowardScore: false },
    ]);
    expect(aggregates).toEqual({ totalQuestions: 2, correctCount: 1 });
  });

  it('a writing-only session produces no scored totals (0/0, never 0/1)', () => {
    expect(computePracticeAggregates([
      { result: 'ungradable', countsTowardScore: false },
    ])).toEqual({ totalQuestions: 0, correctCount: 0 });
  });
});
