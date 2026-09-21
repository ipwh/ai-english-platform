// ============================================
// R3.10-C.2 — J: mastery authority tests
// Proves recordActivityMastery forwards ONLY server-derived verified
// totals to the mastery engine — never recomputes from raw
// PracticeSession aggregates (there is no session input at all).
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { mockUpdateAfterExercise } = vi.hoisted(() => ({
  mockUpdateAfterExercise: vi.fn(),
}));

vi.mock('@/modules/student/mastery/services/student-mastery-service', () => ({
  updateAfterExercise: mockUpdateAfterExercise,
}));

import { recordActivityMastery } from '../services/activity-accounting-service';

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateAfterExercise.mockResolvedValue({});
});

describe('R3.10-C.2 mastery authority (J)', () => {
  it('J.1: mastery receives verified totals verbatim (grammar skill normalization)', async () => {
    await recordActivityMastery({
      studentId: 'student-1',
      skill: 'tenses-simple',
      subSkill: '簡單時態',
      totalQuestions: 3,
      correctCount: 1,
    });

    expect(mockUpdateAfterExercise).toHaveBeenCalledWith({
      studentId: 'student-1',
      skill: 'grammar', // non-canonical skill keys normalized to grammar
      subSkill: '簡單時態',
      totalQuestions: 3,
      correctCount: 1,
    });
  });

  it('J.2: verified reading totals are forwarded with canonical skill', async () => {
    await recordActivityMastery({
      studentId: 'student-1',
      skill: 'reading',
      subSkill: '閱讀理解',
      totalQuestions: 5,
      correctCount: 4,
    });

    expect(mockUpdateAfterExercise).toHaveBeenCalledWith({
      studentId: 'student-1',
      skill: 'reading',
      subSkill: '閱讀理解',
      totalQuestions: 5,
      correctCount: 4,
    });
  });

  it('J.3: practice submission service gates mastery on authoritative server-derived totals', () => {
    const svc = readFileSync(
      resolve(import.meta.dirname, '../../exercise/services/practice-submission-service.ts'), 'utf-8');
    expect(svc).toContain('shouldUpdateMastery(submissionClass, aggregates.totalQuestions)');
    expect(svc).toContain('recordPracticeSessionMasteryOnce({');
    expect(svc).toContain('correctCount: aggregates.correctCount');
    // zero-answer presence flow never feeds mastery:
    expect(svc).toContain('if (masteryUpdated)');
  });
});
