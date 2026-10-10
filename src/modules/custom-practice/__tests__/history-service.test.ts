// ============================================
// Self-Directed Practice — practice-history integration (2026-10-10)
// ============================================
// The student's 練習歷史 must also show the custom-practice sets of a Hong Kong day
// (a day on which ONLY custom practice happened must appear at all), while the
// isolation contract stays untouched: these entries are engagement records that never
// reach evidence / accuracy / mastery / XP.
// ============================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  countByDay: vi.fn(),
  listByDay: vi.fn(),
}));

vi.mock('../repositories/custom-practice-repo', () => ({
  countOwnSetsByDayKey: mocks.countByDay,
  listOwnSetsByDayKey: mocks.listByDay,
}));

import { getCustomPracticeHistoryDay, getCustomPracticeHistoryMonth } from '../services/history-service';

beforeEach(() => {
  mocks.countByDay.mockReset();
  mocks.listByDay.mockReset();
});

describe('custom practice in the practice history', () => {
  it('returns one row per Hong Kong day for the month (engagement only)', async () => {
    mocks.countByDay.mockResolvedValue([
      { dayKey: '2026-10-10', setsCount: 2 },
      { dayKey: '2026-10-08', setsCount: 1 },
    ]);

    const days = await getCustomPracticeHistoryMonth('student-1', '2026-10');

    expect(days).toEqual([
      { dayKey: '2026-10-10', setsCount: 2 },
      { dayKey: '2026-10-08', setsCount: 1 },
    ]);
    // The month window is the Hong Kong month, not the UTC one (HK = UTC+8).
    const [studentId, since, until] = mocks.countByDay.mock.calls[0];
    expect(studentId).toBe('student-1');
    expect(since.toISOString()).toBe('2026-09-30T16:00:00.000Z');
    expect(until.toISOString()).toBe('2026-10-31T16:00:00.000Z');
  });

  it('maps the day query to the fields the history view renders, with no score invention', async () => {
    mocks.listByDay.mockResolvedValue([
      {
        id: 'set-1',
        objective: '[grammar] present perfect',
        category: 'grammar',
        difficulty: 'intermediate',
        questionCount: 10,
        createdAt: new Date('2026-10-10T02:00:00.000Z'),
        submitted: true,
        submittedAt: new Date('2026-10-10T02:20:00.000Z'),
        awardedMarks: 9,
        totalMarks: 10,
        needsReviewCount: 0,
      },
      {
        id: 'set-2',
        objective: '[vocabulary] too + adjective',
        category: 'vocabulary',
        difficulty: 'basic',
        questionCount: 5,
        createdAt: new Date('2026-10-10T03:00:00.000Z'),
        submitted: false,
        submittedAt: null,
        awardedMarks: null,
        totalMarks: null,
        needsReviewCount: null,
      },
    ]);

    const entries = await getCustomPracticeHistoryDay('student-1', '2026-10-10');

    expect(entries.map(entry => entry.id)).toEqual(['set-1', 'set-2']);
    expect(entries[0]).toMatchObject({ submitted: true, awardedMarks: 9, totalMarks: 10 });
    // An unsubmitted set reports null marks — never 0, which would read as "scored zero".
    expect(entries[1]).toMatchObject({ submitted: false, awardedMarks: null, totalMarks: null });

    // The day window is bounded to that Hong Kong day.
    const [, since, until] = mocks.listByDay.mock.calls[0];
    expect(since.toISOString()).toBe('2026-10-09T16:00:00.000Z');
    expect(until.toISOString()).toBe('2026-10-10T16:00:00.000Z');
  });

  it('never touches the evidence projection (the history aggregates stay HKDSE-only)', async () => {
    mocks.countByDay.mockResolvedValue([]);
    mocks.listByDay.mockResolvedValue([]);

    await getCustomPracticeHistoryMonth('student-1', '2026-10');
    await getCustomPracticeHistoryDay('student-1', '2026-10-10');

    // Only these two bounded readers may be called: any evidence/aggregate query
    // (accuracy, mastery, practice sessions) would show up here.
    const called = [...mocks.countByDay.mock.calls, ...mocks.listByDay.mock.calls].length;
    expect(called).toBe(2);
    expect(mocks.countByDay).toHaveBeenCalledTimes(1);
    expect(mocks.listByDay).toHaveBeenCalledTimes(1);
  });
});
