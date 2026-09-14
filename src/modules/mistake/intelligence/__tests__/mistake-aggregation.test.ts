// ============================================
// 2026-09-14: 弱項聚合 — 以技能／題型分桶
//
// 舊版把 mistakeType（分類字串）當題目文字丢進 extractGrammarPoint() 的正則
// → 幾乎所有錯題歸為 'general'。這裡證明聚合已改用 bucket key，並且
// 不再出現的弱項會被標記 mastered（不再永遠留在弱項清單）。
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@/shared/db/db', () => ({
  db: {
    mistake: { findMany: mocks.findMany },
    studentMistakeSummary: { upsert: mocks.upsert, updateMany: mocks.updateMany },
  },
}));

import { aggregateMistakes } from '../repositories/mistake-intelligence-repo';
import { bucketKeyLabelZh } from '../services/mistake-skill-breakdown';

const ROW = {
  mistakeType: 'comprehension',
  createdAt: new Date('2026-09-10T00:00:00Z'),
  reviewed: false,
  languageSkill: 'reading',
  grammarItem: null,
  questionType: 'inference',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.upsert.mockImplementation((args: { create: Record<string, unknown> }) => ({ id: 's1', ...args.create }));
  mocks.updateMany.mockResolvedValue({ count: 0 });
});

describe('aggregateMistakes — 分桶', () => {
  it('閱讀錯題以 dseType 分桶，而非落入 general', async () => {
    mocks.findMany.mockResolvedValue([ROW, ROW]);

    const summaries = await aggregateMistakes('s1');

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { studentId_grammarCategory: { studentId: 's1', grammarCategory: 'reading:inference' } },
      create: expect.objectContaining({
        grammarCategory: 'reading:inference',
        mistakeCount: 2,
        // comprehension → critical（classifySeverity）
        severity: 'critical',
      }),
    }));
    expect(summaries).toHaveLength(1);
  });

  it('文法錯題以 grammarItem 分桶', async () => {
    mocks.findMany.mockResolvedValue([
      { ...ROW, mistakeType: 'grammar', languageSkill: null, questionType: 'mc', grammarItem: 'tenses-simple' },
    ]);

    await aggregateMistakes('s1');

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ grammarCategory: 'grammar:tenses-simple', severity: 'major' }),
    }));
  });

  it('同一弱項再現時會重新標記為未掌握', async () => {
    mocks.findMany.mockResolvedValue([ROW]);

    await aggregateMistakes('s1');

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ mastered: false }),
    }));
  });

  it('不再出現的弱項桶 → 標記 mastered', async () => {
    mocks.findMany.mockResolvedValue([ROW]);

    await aggregateMistakes('s1');

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        studentId: 's1',
        mastered: false,
        grammarCategory: { notIn: ['reading:inference'] },
      }),
      data: { mastered: true },
    }));
  });

  it('完全沒有錯題時仍會清理舊弱項（不殘留）', async () => {
    mocks.findMany.mockResolvedValue([]);

    const summaries = await aggregateMistakes('s1');

    expect(summaries).toEqual([]);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { studentId: 's1', mastered: false },
      data: { mastered: true },
    }));
  });
});

describe('bucketKeyLabelZh — 弱項標籤解析', () => {
  it('閱讀題型 → 題型中文標籤', () => {
    expect(bucketKeyLabelZh('reading:inference')).toBe('推論 — 讀出言外之意');
  });

  it('未分類閱讀 → 理解類標籤（不冒充特定題型）', () => {
    expect(bucketKeyLabelZh('reading:unclassified')).toBe('閱讀／聆聽理解（未分類題型）');
  });

  it('文法桶 → 文法項目中文標籤', () => {
    expect(bucketKeyLabelZh('grammar:tenses-simple')).toBeTruthy();
    expect(bucketKeyLabelZh('grammar:tenses-simple')).not.toBe('grammar:tenses-simple');
  });

  it('錯誤類型桶 → 對應策略卡標籤', () => {
    expect(bucketKeyLabelZh('vocabulary')).toBe('詞彙運用');
  });

  it('無法解析時回 null（呼叫方自行退回原值）', () => {
    expect(bucketKeyLabelZh('totally-unknown')).toBeNull();
  });
});
