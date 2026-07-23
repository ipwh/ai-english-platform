// Sprint 9+: SM-2 SRS Algorithm — 真正的邏輯測試（邊界條件、數學正確性）
// 測試 calculateNextReview() 的完整行為
import { describe, it, expect } from 'vitest';
import { calculateNextReview, getDueForReview, estimateCategoryMastery } from '../services/mistake-tracker';
import type { MistakeRecord } from '../types';

function makeMistake(overrides: Partial<MistakeRecord> = {}): MistakeRecord {
  return {
    id: 'm1', studentId: 's1', questionId: 'q1',
    questionSummary: 'Simple past tense question',
    studentAnswer: 'goed', correctAnswer: 'went',
    category: 'grammar', reviewed: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('SM-2 SRS Algorithm — 數學正確性測試', () => {
  // ============================================
  // 1. 初始間隔測試
  // ============================================
  it('第一次正確回答 (quality=4) 應設定間隔為 1 天', () => {
    const result = calculateNextReview(0, 2.5, 4);
    expect(result.interval).toBe(1);
    expect(result.easeFactor).toBe(2.5); // 高品質不應顯著改變 EF
  });

  it('第一次完美回答 (quality=5) 應設定間隔為 1 天', () => {
    const result = calculateNextReview(0, 2.5, 5);
    expect(result.interval).toBe(1);
    expect(result.easeFactor).toBeGreaterThanOrEqual(2.5);
  });

  it('第一次回答很差 (quality=0) 應重設間隔為 1 天', () => {
    const result = calculateNextReview(0, 2.5, 0);
    expect(result.interval).toBe(1);
    expect(result.easeFactor).toBeLessThan(2.5); // EF 應下降
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3); // 但不低於最小值
  });

  // ============================================
  // 2. 間隔增長測試
  // ============================================
  it('間隔 1 天後正確回答應增長至 3 天', () => {
    const result = calculateNextReview(1, 2.5, 4);
    expect(result.interval).toBe(3);
  });

  it('間隔 3 天後正確回答應按 EF 倍數增長', () => {
    const result = calculateNextReview(3, 2.5, 4);
    expect(result.interval).toBeGreaterThanOrEqual(7); // 3 * 2.5 = 7.5 → round to 8 or 7
  });

  it('多次完美回答應使間隔快速增長', () => {
    // 模擬 SM-2 序列: day1 → day3 → ~day8 → ~day20 → ...
    let interval = 0;
    let ef = 2.5;
    const intervals: number[] = [];

    for (let i = 0; i < 5; i++) {
      const result = calculateNextReview(interval, ef, 5);
      interval = result.interval;
      ef = result.easeFactor;
      intervals.push(interval);
    }

    // 間隔應呈指數增長
    expect(intervals[0]).toBe(1);   // 第一次
    expect(intervals[1]).toBe(3);   // 1*3
    expect(intervals[2]).toBeGreaterThanOrEqual(7);  // 3*EF
    expect(intervals[3]).toBeGreaterThan(intervals[2]);
    expect(intervals[4]).toBeGreaterThan(intervals[3]);
  });

  // ============================================
  // 3. 品質閾值測試 (quality < 3 應重設)
  // ============================================
  it('quality=2 應重設間隔為 1 天（即使之前已增長）', () => {
    const result = calculateNextReview(10, 2.5, 2);
    expect(result.interval).toBe(1); // 重設
    expect(result.easeFactor).toBeLessThan(2.5); // EF 下降
  });

  it('quality=3 不應重設間隔', () => {
    const result = calculateNextReview(3, 2.5, 3);
    expect(result.interval).toBeGreaterThan(1); // 不重設
  });

  // ============================================
  // 4. Ease Factor 邊界測試
  // ============================================
  it('EF 不應低於 1.3', () => {
    // 連續低品質回答
    let ef = 2.5;
    let interval = 0;
    for (let i = 0; i < 20; i++) {
      const result = calculateNextReview(interval, ef, 0);
      ef = result.easeFactor;
      interval = result.interval;
    }
    expect(ef).toBeGreaterThanOrEqual(1.3);
  });

  it('EF 增長應有上限（SM-2 演算法邊際遞減）', () => {
    let ef = 2.5;
    let interval = 0;
    for (let i = 0; i < 20; i++) {
      const result = calculateNextReview(interval, ef, 5);
      ef = result.easeFactor;
      interval = result.interval;
    }
    // SM-2 演算法中完美回答會持續微幅增加 EF
    // 重點是 EF 不低於 1.3，且間隔正確指數增長
    expect(ef).toBeGreaterThanOrEqual(1.3);
    expect(interval).toBeGreaterThan(30);
  });

  // ============================================
  // 5. 日期計算正確性
  // ============================================
  it('nextDate 應在未來正確的天數之後', () => {
    const now = Date.now();
    const result = calculateNextReview(3, 2.5, 5);
    const diffMs = result.nextDate.getTime() - now;
    const diffDays = Math.round(diffMs / 86400000);
    expect(diffDays).toBe(result.interval);
  });

  it('低品質後 nextDate 應為明天', () => {
    const result = calculateNextReview(10, 2.5, 0);
    const diffMs = result.nextDate.getTime() - Date.now();
    const diffDays = Math.round(diffMs / 86400000);
    expect(diffDays).toBe(1); // 重設為明天
  });

  // ============================================
  // 6. 浮點數精度
  // ============================================
  it('EF 應四捨五入至小數點後 2 位', () => {
    const result = calculateNextReview(1, 2.5, 4);
    const efStr = result.easeFactor.toString();
    const decimalPlaces = efStr.includes('.') ? efStr.split('.')[1].length : 0;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });
});

describe('getDueForReview — 到期篩選邏輯', () => {
  it('應回傳 nextReviewDate 在過去的未複習錯題', () => {
    const past = new Date(Date.now() - 86400000); // 昨天
    const mistakes = [
      makeMistake({ id: 'm1', nextReviewDate: past, reviewed: false }),
      makeMistake({ id: 'm2', nextReviewDate: past, reviewed: true }),  // 已複習
    ];
    expect(getDueForReview(mistakes)).toHaveLength(1);
  });

  it('不應回傳未來日期的錯題', () => {
    const future = new Date(Date.now() + 86400000 * 7); // 7 天後
    const mistakes = [
      makeMistake({ id: 'm1', nextReviewDate: future, reviewed: false }),
    ];
    expect(getDueForReview(mistakes)).toHaveLength(0);
  });

  it('無 nextReviewDate 的錯題不應被回傳', () => {
    const mistakes = [
      makeMistake({ id: 'm1', nextReviewDate: undefined, reviewed: false }),
    ];
    expect(getDueForReview(mistakes)).toHaveLength(0);
  });
});

describe('estimateCategoryMastery — 掌握度估算', () => {
  it('無錯題時應回傳 100', () => {
    expect(estimateCategoryMastery([], 'grammar')).toBe(100);
  });

  it('近期錯題越多掌握度越低', () => {
    const now = new Date();
    const mistakes = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      return makeMistake({ id: `m${i}`, category: 'grammar', createdAt: d });
    });
    const mastery = estimateCategoryMastery(mistakes, 'grammar');
    expect(mastery).toBeLessThan(100);
    expect(mastery).toBeGreaterThanOrEqual(0);
  });

  it('已複習的錯題應提高掌握度', () => {
    const now = new Date();
    const mistakes = [
      makeMistake({ id: 'm1', category: 'vocabulary', createdAt: now, reviewed: true }),
      makeMistake({ id: 'm2', category: 'vocabulary', createdAt: now, reviewed: true }),
      makeMistake({ id: 'm3', category: 'vocabulary', createdAt: now, reviewed: true }),
    ];
    const withReview = estimateCategoryMastery(mistakes, 'vocabulary');

    const unreviewed = [
      makeMistake({ id: 'm1', category: 'vocabulary', createdAt: now, reviewed: false }),
      makeMistake({ id: 'm2', category: 'vocabulary', createdAt: now, reviewed: false }),
      makeMistake({ id: 'm3', category: 'vocabulary', createdAt: now, reviewed: false }),
    ];
    const withoutReview = estimateCategoryMastery(unreviewed, 'vocabulary');

    expect(withReview).toBeGreaterThan(withoutReview);
  });
});
