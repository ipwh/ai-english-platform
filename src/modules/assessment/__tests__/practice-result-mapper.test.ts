// ============================================
// R3.4: Practice → StudentAssessmentResult Mapper — Focused Tests
// ============================================
import { describe, it, expect } from 'vitest';
import {
  mapPracticeSessionToStudentAssessmentResult,
  mapSessionSkillToMasterySkill,
  mapPracticeSourceToContext,
  type PracticeSessionProjectionInput,
  type PracticeAnswerProjectionInput,
} from '../services/practice-result-mapper';

function session(overrides: Partial<PracticeSessionProjectionInput> = {}): PracticeSessionProjectionInput {
  return {
    id: 'sess-1',
    studentId: 'stu-1',
    skill: 'present-perfect',
    source: 'ai-generated',
    completedAt: '2026-08-13T10:00:00.000Z',
    ...overrides,
  };
}

function answer(overrides: Partial<PracticeAnswerProjectionInput> = {}): PracticeAnswerProjectionInput {
  return {
    questionId: 'q1',
    questionIndex: 0,
    studentAnswer: 'B',
    result: 'correct',
    awardedScore: 1,
    maxScore: 1,
    countsTowardScore: true,
    scoredBy: 'server',
    scoringMethod: 'deterministic-answer-comparison',
    createdAt: '2026-08-13T10:00:00.000Z',
    ...overrides,
  };
}

// ============================================
// 1-2-3: projectable row, identity preservation
// ============================================

describe('Projectable deterministic practice rows', () => {
  it('maps a deterministic server-scored row to a projectable result', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [answer()]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.assessmentId).toBe('sess-1');
    expect(result.value.studentId).toBe('stu-1');
    expect(result.value.context).toBe('practice');
    expect(result.value.skill).toBe('grammar'); // via knowledge-graph grammar node
  });

  it('preserves questionId exactly (never synthesized)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [answer({ questionId: 'ai-1699999999999-3' })]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.items[0].questionId).toBe('ai-1699999999999-3');
    expect(result.value.items[0].questionId).not.toContain('sess-1');
  });

  it('keeps questionIndex as separate ordering evidence (not identity)', () => {
    const a1 = answer({ questionId: 'q-a', questionIndex: 5 });
    const a2 = answer({ questionId: 'q-b', questionIndex: 0 });
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [a1, a2]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    // Item order follows persisted row order; identity is questionId only.
    expect(result.value.items.map(i => i.questionId)).toEqual(['q-a', 'q-b']);
  });
});

// ============================================
// 4-8: scoring fidelity — copy, never recompute
// ============================================

describe('Scoring fidelity (copy, never recompute)', () => {
  it('preserves result / awardedScore / maxScore / countsTowardScore exactly', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ result: 'incorrect', awardedScore: 0, maxScore: 1, countsTowardScore: true }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.items[0]).toMatchObject({
      result: 'incorrect', awardedScore: 0, maxScore: 1, countsTowardScore: true,
    });
  });

  it('preserves partial credit exactly (2 / 5 stays 2 / 5)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ result: 'partial', awardedScore: 2, maxScore: 5 }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.items[0].awardedScore).toBe(2);
    expect(result.value.items[0].maxScore).toBe(5);
    expect(result.value.score).toBe(2);
    expect(result.value.maxScore).toBe(5);
  });

  it('does NOT derive score from result when values are persisted', () => {
    // A persisted odd-but-valid row must be copied verbatim — the mapper
    // never recomputes, never "corrects" persistence.
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ result: 'correct', awardedScore: 1, maxScore: 2 }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.items[0].awardedScore).toBe(1);
    expect(result.value.items[0].maxScore).toBe(2);
    expect(result.value.percentage).toBe(50);
  });
});

// ============================================
// 9-10: aggregation semantics
// ============================================

describe('Aggregation over counted items only', () => {
  it('aggregates multiple items deterministically', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ questionId: 'q1', result: 'correct', awardedScore: 1, maxScore: 1 }),
      answer({ questionId: 'q2', result: 'incorrect', awardedScore: 0, maxScore: 1 }),
      answer({ questionId: 'q3', result: 'partial', awardedScore: 1, maxScore: 2 }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.score).toBe(2);
    expect(result.value.maxScore).toBe(4);
    expect(result.value.percentage).toBe(50);
  });

  it('excluded item (countsTowardScore=false) does not corrupt the denominator', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ questionId: 'q1', result: 'correct', awardedScore: 1, maxScore: 1 }),
      answer({ questionId: 'q2', result: 'incorrect', awardedScore: 0, maxScore: 1 }),
      answer({ questionId: 'q3', result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.score).toBe(1);
    expect(result.value.maxScore).toBe(2);
    expect(result.value.percentage).toBe(50);
  });
});

// ============================================
// 11-14: provenance
// ============================================

describe('Provenance mapping', () => {
  it("scoredBy='server' → evaluator='server'", () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [answer()]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.provenance.evaluator).toBe('server');
  });

  it('scoringMethod is preserved as provenance.method', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [answer()]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.provenance.method).toBe('deterministic-answer-comparison');
  });

  it('evaluatorVersion is never invented — stays undefined', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [answer()]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.provenance.evaluatorVersion).toBeUndefined();
    expect('evaluatorVersion' in result.value.provenance).toBe(false);
  });

  it('provenance.createdAt comes from the authoritative persisted row timestamp', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ questionId: 'q1', createdAt: '2026-08-13T10:00:00.000Z' }),
      answer({ questionId: 'q2', createdAt: '2026-08-13T10:05:00.000Z' }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    // latest evaluation-record timestamp among the session's rows
    expect(result.value.provenance.createdAt).toBe('2026-08-13T10:05:00.000Z');
  });
});

// ============================================
// 15-24: NOT_PROJECTABLE matrix
// ============================================

describe('NOT_PROJECTABLE matrix', () => {
  it("scoredBy='client' (reading) → NOT_PROJECTABLE — never cast into the enum", () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session({ source: 'dse-reading' }), [
      answer({ scoredBy: 'client', scoringMethod: 'reading-evaluation-forwarded', result: 'partial', awardedScore: 0.5 }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('unsupported-authority');
  });

  it('historical questionId=null → NOT_PROJECTABLE missing-question-id (no synthesis)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ questionId: null }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('missing-question-id');
  });

  it('writing presence-marker session (no items) → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'dse-writing', skill: 'writing' }),
      [],
    );
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('no-items');
  });

  it('speaking presence-marker session (no items) → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'dse-speaking', skill: 'speaking' }),
      [],
    );
    expect(result.status).toBe('not-projectable');
  });

  it('integrated presence-marker session (no items) → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'dse-integrated-skills', skill: 'integrated-skills' }),
      [],
    );
    expect(result.status).toBe('not-projectable');
  });

  it('assignment session without per-item rows → NOT_PROJECTABLE (R3.5)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'assignment' }),
      [],
    );
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('no-items');
  });

  it('diagnostic session (aggregate-only) → NOT_PROJECTABLE (R3.8)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'diagnostic' }),
      [],
    );
    expect(result.status).toBe('not-projectable');
  });

  it('unknown scoredBy → NOT_PROJECTABLE unsupported-authority', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ scoredBy: 'robot' }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('unsupported-authority');
  });

  it('missing result → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ result: null }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('missing-result');
  });

  it('missing awardedScore → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ awardedScore: null }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('missing-awarded-score');
  });

  it('missing maxScore → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ maxScore: null }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('missing-max-score');
  });

  it('missing countsTowardScore → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ countsTowardScore: null }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('missing-counts-toward-score');
  });

  it('missing scoringMethod → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ scoringMethod: null }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('missing-scoring-method');
  });

  it('invalid persisted score range is NOT repaired → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ awardedScore: 999, maxScore: 5 }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('invalid-score-range');
  });

  it('invalid persisted result enum → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ result: 'maybe' }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('invalid-result');
  });
});

// ============================================
// 25-27: no fabrication
// ============================================

describe('No fabrication of any kind', () => {
  it('never fabricates questionId', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [answer({ questionId: '' })]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('missing-question-id');
  });

  it('never fabricates evaluator for client rows (no cast)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ scoredBy: 'client', scoringMethod: 'reading-evaluation-forwarded' }),
    ]);
    expect(result.status).toBe('not-projectable');
  });

  it('never fabricates evaluatorVersion', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [answer()]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect('evaluatorVersion' in result.value.provenance).toBe(false);
  });

  it('mapper performs no scoring of its own — persisted values are copied even if unusual', () => {
    // studentAnswer 'C' with persisted result 'correct': the mapper copies;
    // it does not re-evaluate the answer.
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ studentAnswer: 'C', result: 'correct', awardedScore: 1, maxScore: 1 }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.items[0].result).toBe('correct');
    expect(result.value.items[0].response).toBe('C');
  });
});

// ============================================
// 28-31: mixed rows, immutability, authority distinction
// ============================================

describe('Mixed rows / immutability / authority distinction', () => {
  it('mixed server + client rows do NOT silently disappear → mixed-authority', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ questionId: 'q1' }),
      answer({ questionId: 'q2', scoredBy: 'client', scoringMethod: 'reading-evaluation-forwarded', result: 'partial', awardedScore: 0.5 }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('mixed-authority');
    expect(result.evidence.authorities).toEqual(['server', 'client']);
  });

  it('does not mutate input objects', () => {
    const s = session();
    const a = answer();
    const sSnapshot = JSON.stringify(s);
    const aSnapshot = JSON.stringify(a);
    mapPracticeSessionToStudentAssessmentResult(s, [a]);
    expect(JSON.stringify(s)).toBe(sSnapshot);
    expect(JSON.stringify(a)).toBe(aSnapshot);
  });

  it('question-definition authority is NOT represented as server authority', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [answer()]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    const keys = Object.keys(result.value.provenance).sort();
    expect(keys).toEqual(['createdAt', 'evaluator', 'method']);
    // No field claims ownership of correctAnswer/choices anywhere.
    expect(JSON.stringify(result.value)).not.toContain('correctAnswer');
    expect(JSON.stringify(result.value)).not.toContain('choices');
  });

  it('contract-validation safety net flags invariant violations', () => {
    // A non-counted item with non-zero awardedScore violates the frozen
    // contract (only ungradable items may be excluded, and excluded items
    // must have awardedScore=0). The explicit per-row checks pass, so the
    // contract validator must catch it — no invalid result is emitted.
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ questionId: 'q1', result: 'correct', awardedScore: 1, maxScore: 1 }),
      answer({ questionId: 'q2', result: 'ungradable', awardedScore: 1, maxScore: 1, countsTowardScore: false }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('contract-validation-failed');
  });
});

// ============================================
// Skill / context deterministic mappings
// ============================================

describe('Deterministic skill & context mappings', () => {
  it('grammarItem → knowledge-graph category', () => {
    expect(mapSessionSkillToMasterySkill('present-perfect')).toBe('grammar');
    expect(mapSessionSkillToMasterySkill('conditionals-type-2-3')).toBe('grammar');
  });

  it('languageSkill direct match', () => {
    expect(mapSessionSkillToMasterySkill('reading')).toBe('reading');
    expect(mapSessionSkillToMasterySkill('writing')).toBe('writing');
    expect(mapSessionSkillToMasterySkill('vocabulary')).toBe('vocabulary');
  });

  it('no arbitrary fallback: general/integrated are unmappable', () => {
    expect(mapSessionSkillToMasterySkill('general')).toBeUndefined();
    expect(mapSessionSkillToMasterySkill('integrated')).toBeUndefined();
    expect(mapSessionSkillToMasterySkill('daily')).toBeUndefined();
  });

  it('unmappable skill → whole session NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ skill: 'general' }),
      [answer()],
    );
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('unmappable-skill');
  });

  it('unknown source → NOT_PROJECTABLE', () => {
    expect(mapPracticeSourceToContext('ai-generated')).toBe('practice');
    expect(mapPracticeSourceToContext('daily-challenge')).toBe('practice');
    expect(mapPracticeSourceToContext('assignment')).toBe('assignment');
    expect(mapPracticeSourceToContext('diagnostic')).toBe('diagnostic');
    expect(mapPracticeSourceToContext('mystery')).toBeUndefined();

    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'mystery' }),
      [answer()],
    );
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('unknown-source');
  });

  it('missing completedAt → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ completedAt: null }),
      [answer()],
    );
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('missing-completed-at');
  });

  it('missing studentId → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ studentId: '' }),
      [answer()],
    );
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('missing-student-id');
  });

  it('all items excluded → NOT_PROJECTABLE no-counted-items', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('no-counted-items');
  });

  it('projectable output always passes the frozen contract validator', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ questionId: 'q1', result: 'correct', awardedScore: 1, maxScore: 1 }),
      answer({ questionId: 'q2', result: 'partial', awardedScore: 1.5, maxScore: 3 }),
      answer({ questionId: 'q3', result: 'ungradable', awardedScore: 0, maxScore: 2, countsTowardScore: false }),
    ]);
    expect(result.status).toBe('projectable');
    // (validator is invoked internally; projectable implies valid)
  });
});

// ============================================
// R3.8: uniform server | ai authority projection
// ============================================

const aiAnswer = (overrides: Partial<PracticeAnswerProjectionInput> = {}): PracticeAnswerProjectionInput =>
  answer({ scoredBy: 'ai', scoringMethod: 'reading-ai-semantic-evaluation', ...overrides });

describe('R3.8 — uniform server authority (unchanged)', () => {
  it('TEST 1: 3 server items → PROJECTABLE, evaluator=server', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'dse-reading', skill: 'reading' }),
      [
        answer({ questionId: 'rq-1', questionIndex: 0, scoringMethod: 'reading-server-exact-match' }),
        answer({ questionId: 'rq-2', questionIndex: 1, scoringMethod: 'reading-server-exact-match' }),
        answer({ questionId: 'rq-3', questionIndex: 2, scoringMethod: 'reading-server-exact-match', result: 'incorrect', awardedScore: 0 }),
      ],
    );
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.provenance.evaluator).toBe('server');
  });

  it('TEST 19: all-server aggregates from counted items only', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ questionId: 'q1', result: 'correct', awardedScore: 1, maxScore: 1 }),
      answer({ questionId: 'q2', result: 'partial', awardedScore: 1, maxScore: 3 }),
      answer({ questionId: 'q3', result: 'ungradable', awardedScore: 0, maxScore: 2, countsTowardScore: false }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.score).toBe(2);
    expect(result.value.maxScore).toBe(4);
    expect(result.value.percentage).toBe(50);
  });
});

describe('R3.8 — uniform ai authority (new)', () => {
  it('TEST 2: 2 ai items → PROJECTABLE, evaluator=ai, method from persisted scoringMethod', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'dse-reading', skill: 'reading' }),
      [
        aiAnswer({ questionId: 'rq-a', questionIndex: 0, result: 'correct', awardedScore: 2, maxScore: 2 }),
        aiAnswer({ questionId: 'rq-b', questionIndex: 1, result: 'partial', awardedScore: 1, maxScore: 3 }),
      ],
    );
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.provenance.evaluator).toBe('ai');
    expect(result.value.provenance.method).toBe('reading-ai-semantic-evaluation');
    expect(result.value.score).toBe(3);
    expect(result.value.maxScore).toBe(5);
  });

  it('TEST 14: exact persisted AI method is returned (no invented method)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session({ source: 'dse-reading', skill: 'reading' }), [
      aiAnswer({ scoringMethod: 'reading-ai-semantic-evaluation' }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.provenance.method).toBe('reading-ai-semantic-evaluation');
  });

  it('TEST 20: all-ai aggregates use identical rules (counted items only)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session({ source: 'dse-reading', skill: 'reading' }), [
      aiAnswer({ questionId: 'rq-a', result: 'correct', awardedScore: 2, maxScore: 2 }),
      aiAnswer({ questionId: 'rq-b', result: 'ungradable', awardedScore: 0, maxScore: 2, countsTowardScore: false }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.score).toBe(2);
    expect(result.value.maxScore).toBe(2);
    expect(result.value.percentage).toBe(100);
  });

  it('TEST 15: no evaluatorVersion is generated for ai provenance', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session({ source: 'dse-reading', skill: 'reading' }), [
      aiAnswer(),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect('evaluatorVersion' in result.value.provenance).toBe(false);
  });

  it('TEST 8-10: invalid ai scores are NOT repaired → NOT_PROJECTABLE', () => {
    const missing = mapPracticeSessionToStudentAssessmentResult(session({ source: 'dse-reading', skill: 'reading' }), [
      aiAnswer({ awardedScore: null }),
    ]);
    expect(missing.status).toBe('not-projectable');
    if (missing.status === 'projectable') return;
    expect(missing.reason).toBe('missing-awarded-score');

    const over = mapPracticeSessionToStudentAssessmentResult(session({ source: 'dse-reading', skill: 'reading' }), [
      aiAnswer({ awardedScore: 5, maxScore: 2 }),
    ]);
    expect(over.status).toBe('not-projectable');

    const negative = mapPracticeSessionToStudentAssessmentResult(session({ source: 'dse-reading', skill: 'reading' }), [
      aiAnswer({ awardedScore: -1 }),
    ]);
    expect(negative.status).toBe('not-projectable');
  });
});

describe('R3.8 — mixed authority remains NOT_PROJECTABLE', () => {
  it('TEST 3: server + ai → mixed-authority (no evaluator chosen)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'dse-reading', skill: 'reading' }),
      [
        answer({ questionId: 'rq-1', scoredBy: 'server', scoringMethod: 'reading-server-exact-match' }),
        aiAnswer({ questionId: 'rq-2' }),
      ],
    );
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('mixed-authority');
    expect(result.evidence.authorities).toEqual(['server', 'ai']);
  });

  it('TEST 21: mixed authority rejected BEFORE aggregate projection', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'dse-reading', skill: 'reading' }),
      [
        answer({ questionId: 'rq-1', scoredBy: 'server', scoringMethod: 'reading-server-exact-match', result: 'incorrect', awardedScore: 0 }),
        aiAnswer({ questionId: 'rq-2', result: 'correct', awardedScore: 2, maxScore: 2 }),
      ],
    );
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('mixed-authority');
    expect('score' in result).toBe(false); // no aggregate was produced
  });

  it('TEST 17: server + unknown → NOT_PROJECTABLE (existing precedence)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ questionId: 'q1' }),
      answer({ questionId: 'q2', scoredBy: 'robot', scoringMethod: 'x' }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(['mixed-authority', 'unsupported-authority']).toContain(result.reason);
  });

  it('TEST 18: ai + unknown → NOT_PROJECTABLE', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      aiAnswer({ questionId: 'q1' }),
      answer({ questionId: 'q2', scoredBy: 'robot', scoringMethod: 'x' }),
    ]);
    expect(result.status).toBe('not-projectable');
  });
});

describe('R3.8 — historical authority refusal (unchanged)', () => {
  it('TEST 4: client → unsupported-authority', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ scoredBy: 'client', scoringMethod: 'reading-evaluation-forwarded', result: 'partial', awardedScore: 0.5 }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('unsupported-authority');
  });

  it('TEST 5: null authority → unsupported-authority', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ scoredBy: null }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('unsupported-authority');
  });

  it('TEST 6: unknown authority → unsupported-authority', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ scoredBy: 'humanoid' }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('unsupported-authority');
  });

  it('TEST 22: client rows are never converted to server/ai', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(
      session({ source: 'dse-reading', skill: 'reading' }),
      [answer({ scoredBy: 'client', scoringMethod: 'reading-evaluation-forwarded', result: 'correct', awardedScore: 2, maxScore: 2 })],
    );
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('unsupported-authority');
    expect(result.evidence.scoredBy).toBe('client');
  });
});

describe('R3.8 — item identity and session aggregate tampering', () => {
  it('TEST 7: missing questionId → missing-question-id (ai rows too)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      aiAnswer({ questionId: null }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('missing-question-id');
  });

  it('TEST 11: countsTowardScore=false excluded from both sums (ai rows)', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session({ source: 'dse-reading', skill: 'reading' }), [
      aiAnswer({ questionId: 'rq-a', result: 'correct', awardedScore: 2, maxScore: 2 }),
      aiAnswer({ questionId: 'rq-b', result: 'ungradable', awardedScore: 0, maxScore: 9, countsTowardScore: false }),
    ]);
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.maxScore).toBe(2); // 9 excluded
  });

  it('TEST 12: zero counted items → no-counted-items', () => {
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      aiAnswer({ result: 'ungradable', awardedScore: 0, maxScore: 1, countsTowardScore: false }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('no-counted-items');
  });

  it('TEST 13: tampered session aggregates are ignored — mapper uses item rows only', () => {
    // Forge every possible session-level aggregate; the mapper input type
    // has no such fields and the mapper reads none of them.
    const tamperedSession = {
      ...session({ source: 'dse-reading', skill: 'reading' }),
      totalQuestions: 1,
      correctCount: 999,
      totalScore: 999,
      maxScore: 999,
      percentage: 999,
    };
    const result = mapPracticeSessionToStudentAssessmentResult(
      tamperedSession as PracticeSessionProjectionInput,
      [
        aiAnswer({ questionId: 'rq-a', result: 'correct', awardedScore: 2, maxScore: 2 }),
        aiAnswer({ questionId: 'rq-b', result: 'incorrect', awardedScore: 0, maxScore: 2 }),
      ],
    );
    expect(result.status).toBe('projectable');
    if (result.status !== 'projectable') return;
    expect(result.value.score).toBe(2);
    expect(result.value.maxScore).toBe(4);
    expect(result.value.percentage).toBe(50);
  });

  it('TEST 16: duplicate questionId → refused by the frozen contract validator (existing semantics)', () => {
    // DB uniqueness (@@unique([sessionId, questionId])) prevents duplicates at
    // write time; defense-in-depth, the frozen validator rejects duplicate
    // item identity during projection.
    const result = mapPracticeSessionToStudentAssessmentResult(session(), [
      answer({ questionId: 'q-dup', questionIndex: 0 }),
      answer({ questionId: 'q-dup', questionIndex: 1, result: 'incorrect', awardedScore: 0 }),
    ]);
    expect(result.status).toBe('not-projectable');
    if (result.status === 'projectable') return;
    expect(result.reason).toBe('contract-validation-failed');
    expect(JSON.stringify(result.evidence.errors)).toContain('duplicate questionId');
  });
});
