// ============================================
// R3.10-C: Practice Evidence Projection Tests
// ============================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluatePracticeEvidence } from '../services/practice-evidence-service';
import { computePracticeAggregates } from '../services/practice-answer-validation';

const verifiedRow = (overrides: Record<string, unknown> = {}) => ({
  questionId: 'q1',
  result: 'correct',
  awardedScore: 1,
  maxScore: 1,
  countsTowardScore: true,
  scoredBy: 'server',
  scoringMethod: 'server-key-resolved',
  ...overrides,
});

// ============================================
// Verified evidence core rules
// ============================================

describe('R3.10-C verified evidence — aggregates equal PracticeAnswer rows', () => {
  it('test 3: totals equal row-derived counts (server-scored rows)', () => {
    const ev = evaluatePracticeEvidence([
      verifiedRow(),
      verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 }),
      verifiedRow({ questionId: 'q3', result: 'incorrect', awardedScore: 0 }),
    ]);
    expect(ev).toEqual({ status: 'verified', totalQuestions: 3, correctCount: 1, accuracy: 33 });
  });

  it('countsTowardScore=false rows are excluded from scored totals', () => {
    const ev = evaluatePracticeEvidence([
      verifiedRow(),
      verifiedRow({ questionId: 'q2', result: 'ungradable', awardedScore: 0, countsTowardScore: false }),
    ]);
    expect(ev).toMatchObject({ status: 'verified', totalQuestions: 1, correctCount: 1 });
  });

  it('test 8/9: zero-answer and presence sessions are UNVERIFIABLE', () => {
    expect(evaluatePracticeEvidence([])).toEqual({ status: 'unverifiable', reason: 'no-answers' });
    expect(evaluatePracticeEvidence(undefined)).toEqual({ status: 'unverifiable', reason: 'no-answers' });
  });

  it('test 11: historical client/null/unknown authority is UNVERIFIABLE — never trusted', () => {
    for (const scoredBy of ['client', null, undefined, 'robot']) {
      const ev = evaluatePracticeEvidence([verifiedRow({ scoredBy })]);
      expect(ev).toEqual({ status: 'unverifiable', reason: 'unsupported-authority' });
    }
  });

  it('R3.10-D: legacy client-key scoring methods are UNVERIFIABLE — server arithmetic alone is not authority', () => {
    const historical = evaluatePracticeEvidence([
      verifiedRow({ scoringMethod: 'deterministic-answer-comparison' }),
    ]);
    expect(historical).toEqual({ status: 'unverifiable', reason: 'unverified-key-authority' });
    const relabeled = evaluatePracticeEvidence([
      verifiedRow({ scoringMethod: 'client-key-deterministic' }),
    ]);
    expect(relabeled).toEqual({ status: 'unverifiable', reason: 'unverified-key-authority' });
  });

  it('R3.10-D: null/unknown scoringMethod is UNVERIFIABLE (key provenance unprovable)', () => {
    expect(evaluatePracticeEvidence([verifiedRow({ scoringMethod: null })])).toEqual({ status: 'unverifiable', reason: 'unverified-key-authority' });
    expect(evaluatePracticeEvidence([verifiedRow({ scoringMethod: 'mystery-method' })])).toEqual({ status: 'unverifiable', reason: 'unverified-key-authority' });
  });

  it('R3.10-D: server-key-resolved grammar rows ARE verified evidence', () => {
    const ev = evaluatePracticeEvidence([
      verifiedRow(),
      verifiedRow({ questionId: 'q2', result: 'incorrect', awardedScore: 0 }),
    ]);
    expect(ev).toMatchObject({ status: 'verified', totalQuestions: 2, correctCount: 1 });
  });

  it('missing/invalid identity, result, or scores → UNVERIFIABLE (no repair)', () => {
    expect(evaluatePracticeEvidence([verifiedRow({ questionId: null })])).toMatchObject({ status: 'unverifiable', reason: 'missing-question-id' });
    expect(evaluatePracticeEvidence([verifiedRow({ result: 'maybe' })])).toMatchObject({ status: 'unverifiable', reason: 'invalid-result' });
    expect(evaluatePracticeEvidence([verifiedRow({ awardedScore: null })])).toMatchObject({ status: 'unverifiable', reason: 'invalid-scores' });
    expect(evaluatePracticeEvidence([verifiedRow({ awardedScore: 5, maxScore: 2 })])).toMatchObject({ status: 'unverifiable', reason: 'invalid-scores' });
    expect(evaluatePracticeEvidence([verifiedRow({ countsTowardScore: false }), verifiedRow({ questionId: 'q2', countsTowardScore: false })])).toMatchObject({ status: 'unverifiable', reason: 'no-counted-items' });
  });

  it('AI-scored rows (reading) are verified with identical rules', () => {
    const ev = evaluatePracticeEvidence([
      verifiedRow({ scoredBy: 'ai', scoringMethod: 'reading-ai-semantic-evaluation', result: 'partial', awardedScore: 1, maxScore: 2 }),
      verifiedRow({ questionId: 'q2', scoredBy: 'ai', scoringMethod: 'reading-ai-semantic-evaluation', result: 'correct', awardedScore: 1, maxScore: 1 }),
    ]);
    expect(ev).toMatchObject({ status: 'verified', totalQuestions: 2, correctCount: 1 });
  });

  it('evaluatePracticeEvidence never mutates inputs', () => {
    const rows = [verifiedRow()];
    const snapshot = JSON.stringify(rows);
    evaluatePracticeEvidence(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

// ============================================
// Aggregate derivation for persistence (route helper)
// ============================================

describe('R3.10-C computePracticeAggregates — client totals never trusted', () => {
  it('test 1/2: forged session totals cannot influence the derived values', () => {
    // The function receives only scored rows — there is no client total input.
    const aggregates = computePracticeAggregates([
      { result: 'correct' },
      { result: 'incorrect' },
      { result: 'incorrect' },
    ]);
    expect(aggregates).toEqual({ totalQuestions: 3, correctCount: 1 });
  });

  it('zero answers → zero totals (presence flows persist honest 0/0)', () => {
    expect(computePracticeAggregates([])).toEqual({ totalQuestions: 0, correctCount: 0 });
  });
});

// ============================================
// Route / consumer boundary contracts (file-level)
// ============================================

describe('R3.10-C consumer boundary contracts', () => {
  const root = resolve(import.meta.dirname, '../../../..');

  it('practice submission service derives grammar aggregates from rows and uses atomic tx', () => {
    const svc = readFileSync(resolve(root, 'src/modules/exercise/services/practice-submission-service.ts'), 'utf-8');
    expect(svc).toContain('computePracticeAggregates(normalizedAnswers)');
    expect(svc).toContain('createPracticeExecutionTx');
    expect(svc).not.toContain('createPracticeSession({');
    // Client totals are not read:
    expect(svc).not.toContain('totalQuestions: totalQuestions || 0');
    expect(svc).not.toContain('correctCount: correctCount || 0');
  });

  it('syncActivityMetrics consumes verified evidence only', () => {
    const svc = readFileSync(resolve(root, 'src/modules/student/state/StudentStateMutationService.ts'), 'utf-8');
    expect(svc).toContain('listPracticeSessionsWithEvidence');
    expect(svc).toContain('evaluatePracticeEvidence');
    expect(svc).toContain("if (evidence.status !== 'verified') continue;");
  });

  it('grammar radar consumes verified evidence only', () => {
    const radar = readFileSync(resolve(root, 'src/app/api/diagnostic/grammar/route.ts'), 'utf-8');
    expect(radar).toContain('getVerifiedPracticeSessions');
    expect(radar).toContain("if (s.evidence.status !== 'verified') continue;");
    expect(radar).not.toContain('/repositories/');
  });

  it('teacher analytics attaches verified evidence per session', () => {
    const route = readFileSync(resolve(root, 'src/app/api/teacher/students/[id]/route.ts'), 'utf-8');
    expect(route).toContain('evaluatePracticeEvidence(s.answers)');
  });

  it('practice history exposes verified evidence', () => {
    const route = readFileSync(resolve(root, 'src/app/api/practice/route.ts'), 'utf-8');
    expect(route).toContain('evaluatePracticeEvidence(s.answers)');
    expect(route).toContain("verified:");
  });

  it('shared weak-skill builder prefers verified totals', () => {
    const utils = readFileSync(resolve(root, 'src/shared/utils/utils.ts'), 'utf-8');
    expect(utils).toContain("session.verified.status === 'verified'");
  });
});
