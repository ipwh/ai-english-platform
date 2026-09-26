// ============================================
// SQL 證據聚合：包裝層契約（不需資料庫，每次 `npm test` 都執行）
// ============================================
// `practice-evidence-sql-equivalence.test.ts` 在交易內執行的是
// `buildVerifiedTotalsSql()` 產生的 SQL 文字（因為全域 `db` 是另一條連線，
// 看不到未提交的 fixture）。本檔補上那一層沒被覆蓋的部分：
// repo 包裝函式是否**原封不動**傳出同一份 SQL 與正確的參數綁定。
//
// 兩者合起來才完整：predicate 語意由 DB-gated 測試保證，綁定由本檔保證。
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ queryRawUnsafe: vi.fn() }));

vi.mock('@/shared/db/db', () => ({
  db: { $queryRawUnsafe: mocks.queryRawUnsafe },
}));

import {
  aggregateVerifiedTotalsForStudent,
  aggregateVerifiedTotalsBySkillForStudent,
  buildVerifiedTotalsSql,
} from '../repositories/practice-repo';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryRawUnsafe.mockResolvedValue([]);
});

describe('aggregateVerifiedTotalsForStudent — 包裝層契約', () => {
  it('傳出與正典 builder 完全相同的 SQL，並綁定 (studentId, since)', async () => {
    const since = new Date('2026-09-21T00:00:00Z');

    await aggregateVerifiedTotalsForStudent('s1', since);

    expect(mocks.queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(mocks.queryRawUnsafe).toHaveBeenCalledWith(buildVerifiedTotalsSql([], []), 's1', since);
  });

  it('省略 since 時綁定 null（全歷史語意，不得誤傳 undefined 而令分頁語意漂移）', async () => {
    await aggregateVerifiedTotalsForStudent('s1');

    expect(mocks.queryRawUnsafe).toHaveBeenCalledWith(buildVerifiedTotalsSql([], []), 's1', null);
  });

  it('無資料列時回傳零值（呼叫端不得因此寫入 0% —— null/0 由證據層決定）', async () => {
    mocks.queryRawUnsafe.mockResolvedValue([]);

    await expect(aggregateVerifiedTotalsForStudent('s1')).resolves.toEqual({
      verifiedTotalQuestions: 0,
      verifiedCorrectCount: 0,
      recordedTotalQuestions: 0,
      recordedCorrectCount: 0,
      sessionsCount: 0,
    });
  });

  it('SQL 為全歷史：不得含有 LIMIT／OFFSET／take（累積值不可被截斷）', async () => {
    await aggregateVerifiedTotalsForStudent('s1');

    const sql = mocks.queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).not.toMatch(/\bLIMIT\b/i);
    expect(sql).not.toMatch(/\bOFFSET\b/i);
  });
});

describe('aggregateVerifiedTotalsBySkillForStudent — 包裝層契約', () => {
  it('以技能分組，並綁定 (studentId, null)', async () => {
    await aggregateVerifiedTotalsBySkillForStudent('s1');

    const [sql, studentId, since] = mocks.queryRawUnsafe.mock.calls[0] as [string, string, unknown];
    expect(studentId).toBe('s1');
    expect(since).toBeNull();
    expect(sql).toContain('GROUP BY sc.skill');
    // 標籤須來自「最新已驗證場次」（與正典 TS 投影一致），不可用 min()
    expect(sql).toContain('array_agg(sc."skillZh" ORDER BY sc."startedAt" DESC');
    expect(sql).toContain('FILTER (WHERE v.bad_rows = 0 AND v.counted_rows > 0)');
    expect(sql).not.toMatch(/min\(sc\."skillZh"\)/);
  });
});
