// ============================================
// 2026-09-14: 錯題 SRS 候選查詢契約
//
// 驗證 where 條件的語意（尤其 SQL NULL 行為）：
//   - 篇章題目（reading/listening 或 mistakeType=comprehension）不得入每日卡片
//   - 歷史列（languageSkill 為 null）必須保留，靠 mistakeType 排除篇章題
//   - 只有從未排程或已到期的錯題才到期
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('@/shared/db/db', () => ({
  db: { mistake: { findMany: mocks.findMany } },
}));

import { listDueMistakesForReview } from '../repositories/mistake-repo';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

describe('listDueMistakesForReview', () => {
  it('以 studentId 查詢並限制回傳數量', async () => {
    await listDueMistakesForReview('s1', 20);

    const args = mocks.findMany.mock.calls[0][0];
    expect(args.where.studentId).toBe('s1');
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('排除 passage-bound 錯題：mistakeType=comprehension', async () => {
    await listDueMistakesForReview('s1');

    const { where } = mocks.findMany.mock.calls[0][0];
    expect(where.NOT).toEqual({ mistakeType: 'comprehension' });
  });

  it('排除 reading / listening 技能，但保留 languageSkill 為 null 的歷史列', async () => {
    await listDueMistakesForReview('s1');

    const { where } = mocks.findMany.mock.calls[0][0];
    // 必須是顯式 OR（null 分支），否則 SQL 的 NULL NOT IN (...) 會靜默排除歷史列
    expect(where.AND[0]).toEqual({
      OR: [{ languageSkill: null }, { languageSkill: { notIn: ['reading', 'listening'] } }],
    });
  });

  it('只抽取從未排程或已到期的錯題', async () => {
    await listDueMistakesForReview('s1');

    const { where } = mocks.findMany.mock.calls[0][0];
    const dueClause = where.AND[1];
    expect(dueClause.OR[0]).toEqual({ nextReviewDate: null });
    expect(dueClause.OR[1].nextReviewDate.lte).toBeInstanceOf(Date);
  });
});
