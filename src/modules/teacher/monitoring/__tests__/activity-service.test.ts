// Sprint 133: activity-service tests — short-writing detection (pure logic)
// 2026-09-21 稽核：新增活動狀態分類、香港日界線與 DB 端極短寫作計數。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  writingDraftFindMany: vi.fn(),
  writingDraftGroupBy: vi.fn(),
  loginLogGroupBy: vi.fn(),
  practiceSessionGroupBy: vi.fn(),
  submissionGroupBy: vi.fn(),
  queryRaw: vi.fn(),
}));

// The service imports db at module level; mock it to avoid
// provider mismatch in the test environment (same pattern as teacher-copilot tests).
vi.mock('@/shared/db/db', () => ({
  db: {
    writingDraft: { findMany: mocks.writingDraftFindMany, groupBy: mocks.writingDraftGroupBy },
    loginLog: { groupBy: mocks.loginLogGroupBy },
    practiceSession: { groupBy: mocks.practiceSessionGroupBy },
    submission: { groupBy: mocks.submissionGroupBy },
    $queryRaw: mocks.queryRaw,
  },
}));

import {
  countShortWritings,
  SHORT_WRITING_THRESHOLD_WORDS,
  classifyActivityStatus,
  daysSinceHk,
  getLastActivityMap,
  getShortWritingCounts,
  ACTIVITY_INACTIVE_DAYS,
  ACTIVITY_LOW_DAYS,
} from '../services/activity-service';

const words = (n: number) => Array(n).fill('word').join(' ');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loginLogGroupBy.mockResolvedValue([]);
  mocks.practiceSessionGroupBy.mockResolvedValue([]);
  mocks.writingDraftGroupBy.mockResolvedValue([]);
  mocks.submissionGroupBy.mockResolvedValue([]);
  mocks.queryRaw.mockResolvedValue([]);
});

describe('countShortWritings', () => {
  it('counts drafts below the word threshold as short', () => {
    const result = countShortWritings([
      { studentId: 's1', draft: words(50) },
      { studentId: 's1', draft: words(150) },
      { studentId: 's2', draft: 'tiny' },
    ]);
    expect(result.get('s1')).toBe(1);
    expect(result.get('s2')).toBe(1);
  });

  it('ignores blank drafts', () => {
    const result = countShortWritings([{ studentId: 's1', draft: '   ' }]);
    expect(result.get('s1')).toBeUndefined();
  });

  it('keeps a sane threshold (100 words)', () => {
    expect(SHORT_WRITING_THRESHOLD_WORDS).toBe(100);
  });

  it('returns empty map for no drafts', () => {
    expect(countShortWritings([]).size).toBe(0);
  });
});

describe('classifyActivityStatus (2026-09-21)', () => {
  const NOW = new Date('2026-09-21T04:00:00Z'); // 香港 12:00

  it('distinguishes never-started from long-inactive', () => {
    expect(classifyActivityStatus(null, NOW)).toEqual({ status: 'never-started', daysInactive: null });
    expect(classifyActivityStatus(undefined, NOW)).toEqual({ status: 'never-started', daysInactive: null });
  });

  it('classifies by the documented thresholds', () => {
    const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

    expect(classifyActivityStatus(daysAgo(0), NOW).status).toBe('active');
    expect(classifyActivityStatus(daysAgo(ACTIVITY_LOW_DAYS - 1), NOW).status).toBe('active');
    expect(classifyActivityStatus(daysAgo(ACTIVITY_LOW_DAYS), NOW).status).toBe('low');
    expect(classifyActivityStatus(daysAgo(ACTIVITY_INACTIVE_DAYS - 1), NOW).status).toBe('low');
    expect(classifyActivityStatus(daysAgo(ACTIVITY_INACTIVE_DAYS), NOW).status).toBe('inactive');
    expect(classifyActivityStatus(daysAgo(60), NOW).status).toBe('inactive');
  });

  it('reports daysInactive with a Hong Kong day boundary', () => {
    // 香港 2026-09-21 00:30（= UTC 2026-09-20T16:30Z）→ 距香港 09-21 為 0 日
    expect(daysSinceHk(new Date('2026-09-20T16:30:00Z'), NOW)).toBe(0);
    // 香港 2026-09-20 23:30（= UTC 2026-09-20T15:30Z）→ 1 日
    expect(daysSinceHk(new Date('2026-09-20T15:30:00Z'), NOW)).toBe(1);
  });
});

describe('getLastActivityMap (2026-09-21)', () => {
  it('takes the latest across login, practice, draft and submission signals', async () => {
    mocks.loginLogGroupBy.mockResolvedValue([{ userId: 's1', _max: { loginAt: new Date('2026-09-10T00:00:00Z') } }]);
    mocks.practiceSessionGroupBy.mockResolvedValue([{ studentId: 's1', _max: { startedAt: new Date('2026-09-12T00:00:00Z') } }]);
    mocks.writingDraftGroupBy.mockResolvedValue([{ studentId: 's1', _max: { updatedAt: new Date('2026-09-14T00:00:00Z') } }]);
    mocks.submissionGroupBy.mockResolvedValue([{ studentId: 's1', _max: { submittedAt: new Date('2026-09-11T00:00:00Z') } }]);

    const map = await getLastActivityMap(['s1']);

    expect(map.get('s1')?.toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });

  it('counts a writing-only student as active (drafts are real usage)', async () => {
    mocks.writingDraftGroupBy.mockResolvedValue([{ studentId: 's1', _max: { updatedAt: new Date('2026-09-20T00:00:00Z') } }]);

    const map = await getLastActivityMap(['s1']);

    expect(map.get('s1')).toBeInstanceOf(Date);
  });

  it('counts an assignment-only student as active', async () => {
    mocks.submissionGroupBy.mockResolvedValue([{ studentId: 's1', _max: { submittedAt: new Date('2026-09-20T00:00:00Z') } }]);

    const map = await getLastActivityMap(['s1']);

    expect(map.get('s1')).toBeInstanceOf(Date);
  });

  it('performs no queries for an empty student list', async () => {
    const map = await getLastActivityMap([]);
    expect(map.size).toBe(0);
    expect(mocks.loginLogGroupBy).not.toHaveBeenCalled();
  });
});

describe('getShortWritingCounts (DB-side counting)', () => {
  it('maps raw SQL rows to a student→count map', async () => {
    mocks.queryRaw.mockResolvedValue([{ studentId: 's1', count: 2 }, { studentId: 's2', count: 1 }]);

    const map = await getShortWritingCounts(['s1', 's2']);

    expect(map.get('s1')).toBe(2);
    expect(map.get('s2')).toBe(1);
  });

  it('does not read draft bodies into memory any more', async () => {
    mocks.queryRaw.mockResolvedValue([]);

    await getShortWritingCounts(['s1']);

    expect(mocks.writingDraftFindMany).not.toHaveBeenCalled();
  });

  it('skips the query entirely for an empty student list', async () => {
    const map = await getShortWritingCounts([]);
    expect(map.size).toBe(0);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it('falls back to the in-memory reference rule when the SQL count fails', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('regexp_split_to_array unavailable'));
    mocks.writingDraftFindMany.mockResolvedValue([
      { studentId: 's1', draft: words(30) },
      { studentId: 's1', draft: words(200) },
    ]);

    const map = await getShortWritingCounts(['s1']);

    expect(map.get('s1')).toBe(1);
    expect(mocks.writingDraftFindMany).toHaveBeenCalledTimes(1);
  });
});

