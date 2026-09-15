// ============================================
// 2026-09-14: 錯題技能／題型聚合 + 策略卡
//
// 背景：comprehension / listening 錯題依附在一篇 passage，不可能重考同一題。
// 這裡證明錯題會被捲成技能／題型弱項桶，並且不可重考的題目被正確標示。
// ============================================

import { describe, it, expect } from 'vitest';
import {
  bucketKeyLabelEn,
  bucketKeyLabelZh,
  buildMistakeSkillBreakdown,
  mistakeBucketKey,
  type BreakdownMistakeInput,
} from '../services/mistake-skill-breakdown';
import { getStrategyCard } from '../services/mistake-strategy';

function mk(overrides: Partial<BreakdownMistakeInput> = {}): BreakdownMistakeInput {
  return {
    languageSkill: null,
    grammarItem: null,
    questionType: null,
    mistakeType: 'grammar',
    reviewed: false,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

describe('mistakeBucketKey — 聚合維度：題型 > 文法項目 > 錯誤類型', () => {
  it('閱讀題目依 dseType 分桶', () => {
    expect(mistakeBucketKey(mk({ languageSkill: 'reading', questionType: 'inference' }))).toBe('reading:inference');
  });

  it('聆聽題目依題型分桶', () => {
    expect(mistakeBucketKey(mk({ languageSkill: 'listening', questionType: 'detail' }))).toBe('listening:detail');
  });

  it('閱讀題目缺題型 → unclassified（不猜測題型）', () => {
    expect(mistakeBucketKey(mk({ languageSkill: 'reading' }))).toBe('reading:unclassified');
  });

  it('文法錯題依文法項目分桶', () => {
    expect(mistakeBucketKey(mk({ grammarItem: 'tenses-simple' }))).toBe('grammar:tenses-simple');
  });

  it('無技能資訊的錯題退回錯誤類型', () => {
    expect(mistakeBucketKey(mk({ mistakeType: 'careless' }))).toBe('careless');
  });
});

describe('buildMistakeSkillBreakdown — 弱項聚合', () => {
  it('同一題型的閱讀錯題合併為一桶並標示不可重考', () => {
    const buckets = buildMistakeSkillBreakdown([
      mk({ languageSkill: 'reading', questionType: 'inference', mistakeType: 'comprehension' }),
      mk({ languageSkill: 'reading', questionType: 'inference', mistakeType: 'comprehension' }),
      mk({ languageSkill: 'reading', questionType: 'inference', mistakeType: 'comprehension', reviewed: true }),
    ]);

    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(3);
    expect(buckets[0].unreviewed).toBe(2);
    expect(buckets[0].replayable).toBe(false);
    expect(buckets[0].practice.kind).toBe('reading-paper');
    expect(buckets[0].strategy?.key).toBe('reading.inference');
  });

  it('強弱項排序：錯誤次數多者優先', () => {
    const buckets = buildMistakeSkillBreakdown([
      mk({ grammarItem: 'articles' }),
      mk({ languageSkill: 'reading', questionType: 'inference', mistakeType: 'comprehension' }),
      mk({ languageSkill: 'reading', questionType: 'inference', mistakeType: 'comprehension' }),
    ]);

    expect(buckets.map(b => b.key)).toEqual(['reading:inference', 'grammar:articles']);
  });

  it('文法錯題可重考同一類自足題目', () => {
    const buckets = buildMistakeSkillBreakdown([mk({ grammarItem: 'tenses-simple' })]);

    expect(buckets[0].replayable).toBe(true);
    expect(buckets[0].practice).toMatchObject({ kind: 'targeted-drill', grammarItem: 'tenses-simple' });
    expect(buckets[0].strategy?.key).toBe('grammar.general');
  });

  it('lastSeen 取桶內最新時間', () => {
    const buckets = buildMistakeSkillBreakdown([
      mk({ grammarItem: 'articles', createdAt: new Date('2026-08-01T00:00:00Z') }),
      mk({ grammarItem: 'articles', createdAt: new Date('2026-09-10T00:00:00Z') }),
    ]);

    expect(buckets[0].lastSeen).toBe('2026-09-10T00:00:00.000Z');
  });

  it('閱讀錯題缺題型時仍給出理解類策略卡（不冒充特定題型）', () => {
    const buckets = buildMistakeSkillBreakdown([mk({ languageSkill: 'reading', mistakeType: 'comprehension' })]);

    expect(buckets[0].key).toBe('reading:unclassified');
    expect(buckets[0].strategy?.key).toBe('comprehension.unclassified');
  });

  it('純詞彙錯題導向生詞簿而非生成練習', () => {
    const buckets = buildMistakeSkillBreakdown([mk({ mistakeType: 'vocabulary' })]);

    expect(buckets[0].key).toBe('vocabulary');
    expect(buckets[0].practice.kind).toBe('vocab-book');
  });

  it('limit 限制回傳桶數', () => {
    const buckets = buildMistakeSkillBreakdown([
      mk({ grammarItem: 'articles' }),
      mk({ grammarItem: 'tenses-simple' }),
      mk({ grammarItem: 'prepositions' }),
    ], 2);

    expect(buckets).toHaveLength(2);
  });

  it('空輸入 → 空結果', () => {
    expect(buildMistakeSkillBreakdown([])).toEqual([]);
  });
});

describe('bucketKeyLabelZh / bucketKeyLabelEn — 顯示層標籤', () => {
  it('閱讀題型桶 → 策略卡標籤（不顯示原始 key）', () => {
    expect(bucketKeyLabelZh('reading:inference')).toBe(getStrategyCard({ languageSkill: 'reading', questionType: 'inference' })?.labelZh);
    expect(bucketKeyLabelEn('reading:inference')).toBe(getStrategyCard({ languageSkill: 'reading', questionType: 'inference' })?.labelEn);
  });

  it('unclassified 桶 → 未分類題型說明，而非 reading:unclassified', () => {
    expect(bucketKeyLabelZh('reading:unclassified')).toBe('閱讀／聆聽理解（未分類題型）');
    expect(bucketKeyLabelEn('reading:unclassified')).toBe('Comprehension (unclassified type)');
  });

  it('文法項目桶 → 技能標籤', () => {
    expect(bucketKeyLabelZh('grammar:tenses-simple')).toBeTruthy();
    expect(bucketKeyLabelZh('grammar:tenses-simple')).not.toContain(':');
    expect(bucketKeyLabelEn('grammar:tenses-simple')).toBeTruthy();
  });

  it('錯誤類型桶 → 策略卡標籤；未知值回 null（不杜撰）', () => {
    expect(bucketKeyLabelZh('vocabulary')).toBe(getStrategyCard({ mistakeType: 'vocabulary' })?.labelZh);
    expect(bucketKeyLabelEn('vocabulary')).toBe(getStrategyCard({ mistakeType: 'vocabulary' })?.labelEn);
    expect(bucketKeyLabelZh('mystery')).toBeNull();
    expect(bucketKeyLabelEn('mystery')).toBeNull();
  });

  it('空 scope 值 → null（不產生空字串標籤）', () => {
    expect(bucketKeyLabelZh('reading:')).toBeNull();
    expect(bucketKeyLabelEn('reading:')).toBeNull();
  });
});

describe('getStrategyCard — 無對應內容時不憑空生成', () => {
  it('已知閱讀題型 → 對應策略卡', () => {
    expect(getStrategyCard({ languageSkill: 'reading', questionType: 'vocabulary_in_context' })?.key)
      .toBe('reading.vocabulary_in_context');
  });

  it('未知閱讀題型 → 退回「未分類題型」理解策略（不冒充特定題型）', () => {
    expect(getStrategyCard({ languageSkill: 'reading', questionType: 'unknown_type' })?.key)
      .toBe('comprehension.unclassified');
  });

  it('未知錯誤類型且無技能資訊 → null', () => {
    expect(getStrategyCard({ mistakeType: 'mystery' })).toBeNull();
  });

  it('策略卡為雙語內容且步驟非空', () => {
    const card = getStrategyCard({ languageSkill: 'reading', questionType: 'inference' });
    expect(card?.labelZh).toBeTruthy();
    expect(card?.labelEn).toBeTruthy();
    expect(card?.stepsZh.length).toBeGreaterThan(0);
    expect(card?.stepsEn.length).toBe(card?.stepsZh.length);
  });
});
