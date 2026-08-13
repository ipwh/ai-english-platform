// ============================================
// R3.10-D.3: trusted-state-poisoning.test.ts
// System-level trust-chain regression tests.
// Proves client-controlled / unverified PracticeAnswer data cannot
// poison trusted learning state:
//   mistakes, mastery, verified accuracy, weekly snapshots,
//   adaptive recommendations, studentMastery (diagnostic).
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const {
  mockListSessions,
  mockSubmissionsFindMany,
  mockSnapshotUpsert,
  mockUpdateUser,
} = vi.hoisted(() => ({
  mockListSessions: vi.fn(),
  mockSubmissionsFindMany: vi.fn(),
  mockSnapshotUpsert: vi.fn(),
  mockUpdateUser: vi.fn(),
}));

vi.mock('@/shared/db/db', () => ({
  db: {
    submission: { findMany: mockSubmissionsFindMany },
    weeklySnapshot: { upsert: mockSnapshotUpsert },
  },
}));

vi.mock('@/modules/exercise/repositories/practice-repo', () => ({
  listPracticeSessionsWithEvidence: mockListSessions,
}));

vi.mock('@/modules/student/repositories/user-repo', () => ({
  updateUser: mockUpdateUser,
}));

import { evaluatePracticeEvidence } from '@/modules/exercise/services/practice-evidence-service';
import {
  classifyPracticeSubmission,
  isServerAuthoritativeSubmission,
  shouldUpdateMastery,
} from '@/modules/exercise/services/practice-submission-classification';
import { studentStateMutationService } from '@/modules/student/state/StudentStateMutationService';

const root = resolve(import.meta.dirname, '../../../..');

/** Forged legacy client-key row (scoringMethod = client-key-deterministic). */
const legacyRow = (overrides: Record<string, unknown> = {}) => ({
  questionId: 'client-q-1',
  result: 'correct',
  awardedScore: 1,
  maxScore: 1,
  countsTowardScore: true,
  scoredBy: 'server',
  scoringMethod: 'client-key-deterministic',
  ...overrides,
});

/** Server-authoritative grammar row. */
const grammarRow = (overrides: Record<string, unknown> = {}) => ({
  questionId: 'gq-1',
  result: 'correct',
  awardedScore: 1,
  maxScore: 1,
  countsTowardScore: true,
  scoredBy: 'server',
  scoringMethod: 'server-key-resolved',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmissionsFindMany.mockResolvedValue([]);
  mockSnapshotUpsert.mockResolvedValue({});
  mockUpdateUser.mockResolvedValue({});
});

describe('R3.10-D.3 test 1 — forged legacy answer cannot create trusted Mistake', () => {
  it('legacy-language-skill and unknown classes are NOT mistake-authoritative', () => {
    expect(isServerAuthoritativeSubmission('legacy-language-skill')).toBe(false);
    expect(isServerAuthoritativeSubmission('unknown')).toBe(false);
  });

  it('practice submission service gates auto-mistake sync on the authority contract', () => {
    const svc = readFileSync(resolve(root, 'src/modules/exercise/services/practice-submission-service.ts'), 'utf-8');
    expect(svc).toContain('isServerAuthoritativeSubmission(submissionClass)');
    expect(svc).toContain('createMistakeIfAbsent');
    // the mistake loop is inside the authoritative guard:
    const guardIdx = svc.indexOf('isServerAuthoritativeSubmission(submissionClass)');
    const mistakeIdx = svc.indexOf('createMistakeIfAbsent({');
    expect(mistakeIdx).toBeGreaterThan(guardIdx);
  });
});

describe('R3.10-D.3 test 2 — forged legacy answer cannot influence mastery', () => {
  it('legacy/unknown classes never update mastery regardless of totals', () => {
    expect(shouldUpdateMastery('legacy-language-skill', 10)).toBe(false);
    expect(shouldUpdateMastery('unknown', 10)).toBe(false);
  });

  it('only authoritative classes may update mastery', () => {
    expect(shouldUpdateMastery('grammar', 3)).toBe(true);
    expect(shouldUpdateMastery('reading', 3)).toBe(true);
    expect(shouldUpdateMastery('grammar', 0)).toBe(false);
  });
});

describe('R3.10-D.3 test 3 — forged legacy answer cannot influence verified accuracy', () => {
  it('client-key-deterministic rows are unverified evidence', () => {
    expect(evaluatePracticeEvidence([legacyRow()]))
      .toEqual({ status: 'unverifiable', reason: 'unverified-key-authority' });
  });

  it('server-key-resolved rows remain verified (positive control)', () => {
    expect(evaluatePracticeEvidence([grammarRow()]))
      .toMatchObject({ status: 'verified', totalQuestions: 1, correctCount: 1 });
  });
});

describe('R3.10-D.3 test 4 — forged legacy answer cannot influence weekly snapshot', () => {
  it('syncActivityMetrics ignores legacy client-key rows for accuracy + weekly snapshot', async () => {
    mockListSessions.mockResolvedValue([
      {
        id: 's-legacy',
        startedAt: new Date(),
        totalQuestions: 999,
        correctCount: 999,
        answers: [legacyRow(), legacyRow({ questionId: 'client-q-2', result: 'incorrect', awardedScore: 0 })],
      },
      {
        id: 's-authoritative',
        startedAt: new Date(),
        totalQuestions: 999,
        correctCount: 999,
        answers: [grammarRow(), grammarRow({ questionId: 'gq-2', result: 'incorrect', awardedScore: 0 })],
      },
    ]);

    const result = await studentStateMutationService.syncActivityMetrics('student-1');

    // only the server-key session contributes: 1 correct / 2 total → 50
    expect(result.accuracy).toBe(50);
    expect(mockUpdateUser).toHaveBeenCalledWith('student-1', { overallAccuracy: 50 });

    const upsertCall = mockSnapshotUpsert.mock.calls[0][0];
    expect(upsertCall.create.totalQuestions).toBe(2);
    expect(upsertCall.create.correctCount).toBe(1);
    expect(upsertCall.create.accuracy).toBe(50);
    // forged legacy totals never leak into the weekly snapshot:
    expect(upsertCall.create.totalQuestions).not.toBe(1998);
  });
});

describe('R3.10-D.3 test 5 — forged legacy answer cannot influence adaptive recommendations', () => {
  it('adaptive pipeline consumes mastery + mistakes only, never raw practice totals', () => {
    const pipeline = readFileSync(
      resolve(root, 'src/modules/learning/services/adaptive-learning-pipeline.ts'), 'utf-8');
    expect(pipeline).toContain('getLearningProfile');
    expect(pipeline).toContain('buildWeaknessProfile');
    expect(pipeline).not.toContain('practiceSession');
    expect(pipeline).not.toContain('totalQuestions');
  });

  it('legacy rows cannot reach pipeline inputs: no mistakes (gated) and no mastery (gated)', () => {
    // Both input gates are closed for legacy classes:
    expect(isServerAuthoritativeSubmission('legacy-language-skill')).toBe(false);
    expect(shouldUpdateMastery('legacy-language-skill', 5)).toBe(false);
  });
});

describe('R3.10-D.3 test 6 — forged diagnostic accuracy cannot influence studentMastery', () => {
  it('diagnostic route no longer writes studentMastery and labels results self-reported', () => {
    const route = readFileSync(resolve(root, 'src/app/api/diagnostic/route.ts'), 'utf-8');
    // the mastery write must be gone entirely:
    expect(route).not.toContain("adminDbQuery('studentMastery'");
    expect(route).not.toContain('masteryScore: Math.round(r.accuracy)');
    expect(route).not.toContain('practiceCount: 5');
    expect(route).toContain('selfReported: true');
  });
});

describe('R3.10-D.3 tests 7/8 — authoritative grammar and reading still create mistakes', () => {
  it('grammar and reading classes remain mistake-authoritative', () => {
    expect(isServerAuthoritativeSubmission('grammar')).toBe(true);
    expect(isServerAuthoritativeSubmission('reading')).toBe(true);
  });

  it('reading classification still routes through server scoring', () => {
    expect(classifyPracticeSubmission({ source: 'dse-reading', skill: 'reading' })).toBe('reading');
    expect(classifyPracticeSubmission({ skill: 'tenses', answers: [{ dseType: 'multiple_choice' }] })).toBe('reading');
  });
});

describe('R3.10-D.3 test 9 — unknown skill cannot create trusted learning state', () => {
  it('unknown skill is rejected and never authority-enabled', () => {
    expect(classifyPracticeSubmission({ skill: 'totally-unknown' })).toBe('unknown');
    expect(isServerAuthoritativeSubmission('unknown')).toBe(false);
    expect(shouldUpdateMastery('unknown', 5)).toBe(false);
  });

  it('service rejects unknown skill before any persistence (contract)', () => {
    const svc = readFileSync(resolve(root, 'src/modules/exercise/services/practice-submission-service.ts'), 'utf-8');
    expect(svc).toContain("if (submissionClass === 'unknown')");
    expect(svc).toContain('不支援的 skill');
  });
});

describe('R3.10-D.3 test 10 — historical unverified rows remain excluded', () => {
  it('pre-D.1 and relabeled legacy methods are both unverifiable, never repaired', () => {
    const historical = evaluatePracticeEvidence([
      legacyRow({ scoringMethod: 'deterministic-answer-comparison' }),
    ]);
    expect(historical).toEqual({ status: 'unverifiable', reason: 'unverified-key-authority' });

    const nullMethod = evaluatePracticeEvidence([legacyRow({ scoringMethod: null })]);
    expect(nullMethod).toEqual({ status: 'unverifiable', reason: 'unverified-key-authority' });
  });
});
