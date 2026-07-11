// ============================================
// SRS (Spaced Repetition System) — SM-2 演算法
// 用於詞彙庫與錯題本的主動記憶複習排程
// ============================================

/**
 * SM-2 演算法參數
 * - easeFactor: 簡化版的 EF (初始 2.5，最小 1.3)
 * - interval: 下次複習間隔（天）
 * - repetitions: 連續正確次數
 */
export interface SrsCard {
  easeFactor: number;
  interval: number;
  repetitions: number;
  lastReviewedAt: string; // ISO date
  nextReviewDate: string; // ISO date
}

/**
 * 根據 SM-2 演算法計算下一次複習的排程
 * @param quality 自評品質 0-5 (0=完全忘記, 5=完全記得)
 * @param current 當前 SRS 狀態
 * @returns 更新後的 SRS 狀態
 */
export function calculateNextReview(
  quality: number,
  current?: Partial<SrsCard> | null
): SrsCard {
  const now = new Date();
  const easeFactor = current?.easeFactor ?? 2.5;
  let interval = current?.interval ?? 1;
  let repetitions = current?.repetitions ?? 0;

  if (quality >= 3) {
    // 正確回憶
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    // 忘記 — 重置
    repetitions = 0;
    interval = 1;
  }

  // 更新 EF
  const newEf = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

  return {
    easeFactor: Math.round(newEf * 100) / 100,
    interval,
    repetitions,
    lastReviewedAt: now.toISOString(),
    nextReviewDate: nextReview.toISOString(),
  };
}

/**
 * 詞彙熟悉度 → SRS quality 對應
 * new=0, learning=2, familiar=4, mastered=5
 */
export function familiarityToQuality(familiarity: string): number {
  switch (familiarity) {
    case 'new': return 0;
    case 'learning': return 2;
    case 'familiar': return 4;
    case 'mastered': return 5;
    default: return 0;
  }
}

/**
 * 取得今天應複習的卡片（nextReviewDate <= today）
 */
export function getDueCards<T extends { nextReviewDate?: string | null }>(
  cards: T[]
): T[] {
  const now = new Date();
  return cards.filter(c => {
    if (!c.nextReviewDate) return true; // 未排程的也算需複習
    return new Date(c.nextReviewDate) <= now;
  });
}

/**
 * 取得每日建議複習數量（基於總卡片數）
 */
export function getDailyReviewTarget(totalCards: number): number {
  if (totalCards <= 20) return Math.min(5, totalCards);
  if (totalCards <= 50) return 10;
  if (totalCards <= 100) return 15;
  return 20;
}

/**
 * 取得 SRS 進度文字
 */
export function getSrsProgress(dueCount: number, totalCount: number): {
  percentage: number;
  label: string;
} {
  if (totalCount === 0) return { percentage: 0, label: '尚無待複習' };
  const done = totalCount - dueCount;
  const percentage = Math.round((done / totalCount) * 100);
  if (percentage >= 100) return { percentage: 100, label: '今日複習完成！' };
  if (percentage >= 75) return { percentage, label: '快完成了' };
  if (percentage >= 50) return { percentage, label: '進行中' };
  return { percentage, label: '剛開始' };
}

/**
 * 批次處理複習結果，回傳更新後的卡片狀態
 */
export function processReviewResults<T extends { id: string; nextReviewDate?: string | null }>(
  results: { id: string; quality: number }[],
  cards: (T & Partial<SrsCard>)[]
): (T & Partial<SrsCard>)[] {
  const resultMap = new Map(results.map(r => [r.id, r.quality]));
  return cards.map(card => {
    const quality = resultMap.get(card.id);
    if (quality === undefined) return card;
    const updated = calculateNextReview(quality, card);
    return { ...card, ...updated };
  });
}
