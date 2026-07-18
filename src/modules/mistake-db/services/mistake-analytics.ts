// Sprint 9: Mistake Analytics — pattern analysis and statistics
import type { MistakeRecord, MistakeStats, GrammarPointStat, VocabWordStat, CategoryStats, MistakeCategory } from '../types';
import { classifySeverity, extractGrammarPoint } from './mistake-tracker';

const ALL_CATEGORIES: MistakeCategory[] = ['grammar', 'vocabulary', 'comprehension', 'careless', 'time-management', 'chinglish'];
const CATEGORY_LABELS: Record<MistakeCategory, string> = {
  grammar: '文法', vocabulary: '詞彙', comprehension: '理解',
  careless: '粗心', 'time-management': '時間管理', chinglish: '中式英文',
};

/** Analyze mistake records and generate statistics */
export function analyzeMistakes(mistakes: MistakeRecord[], totalPracticeSessions: number): MistakeStats {
  const now = new Date();
  const ms7d = 7 * 86400000;
  const ms30d = 30 * 86400000;

  const reviewed = mistakes.filter(m => m.reviewed);
  const pending = mistakes.filter(m => !m.reviewed);
  const recent7d = mistakes.filter(m => (now.getTime() - m.createdAt.getTime()) <= ms7d);
  const recent30d = mistakes.filter(m => (now.getTime() - m.createdAt.getTime()) <= ms30d);

  // By category
  const byCategory = {} as Record<MistakeCategory, CategoryStats>;
  for (const cat of ALL_CATEGORIES) {
    const catMistakes = mistakes.filter(m => m.category === cat);
    const catReviewed = catMistakes.filter(m => m.reviewed);
    byCategory[cat] = {
      count: catMistakes.length,
      percentage: mistakes.length > 0 ? Math.round((catMistakes.length / mistakes.length) * 100) : 0,
      severity: classifySeverity(cat),
      reviewRate: catMistakes.length > 0 ? Math.round((catReviewed.length / catMistakes.length) * 100) : 100,
    };
  }

  // Top grammar points
  const grammarMap = new Map<string, { count: number; dates: Date[] }>();
  for (const m of mistakes.filter(m => m.category === 'grammar')) {
    const point = extractGrammarPoint(m.questionSummary);
    const existing = grammarMap.get(point);
    if (existing) { existing.count++; existing.dates.push(m.createdAt); }
    else { grammarMap.set(point, { count: 1, dates: [m.createdAt] }); }
  }
  const topGrammarPoints: GrammarPointStat[] = [...grammarMap.entries()]
    .map(([grammarPoint, data]) => {
      const sorted = data.dates.sort((a, b) => a.getTime() - b.getTime());
      let avgInterval = 0;
      for (let i = 1; i < sorted.length; i++) {
        avgInterval += (sorted[i].getTime() - sorted[i - 1].getTime()) / 86400000;
      }
      return {
        grammarPoint,
        count: data.count,
        lastSeen: sorted[sorted.length - 1],
        avgIntervalDays: sorted.length > 1 ? Math.round(avgInterval / (sorted.length - 1)) : 0,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top vocab words
  const vocabMap = new Map<string, { count: number; lastSeen: Date }>();
  for (const m of mistakes.filter(m => m.category === 'vocabulary')) {
    const word = m.questionSummary.toLowerCase().trim();
    const existing = vocabMap.get(word);
    if (existing) { existing.count++; if (m.createdAt > existing.lastSeen) existing.lastSeen = m.createdAt; }
    else { vocabMap.set(word, { count: 1, lastSeen: m.createdAt }); }
  }
  const topVocabWords: VocabWordStat[] = [...vocabMap.entries()]
    .map(([word, data]) => ({ word, count: data.count, lastSeen: data.lastSeen }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalMistakes: mistakes.length,
    reviewedCount: reviewed.length,
    pendingReviewCount: pending.length,
    byCategory,
    topGrammarPoints,
    topVocabWords,
    recent7Days: recent7d.length,
    recent30Days: recent30d.length,
    mistakesPerSession: totalPracticeSessions > 0
      ? Math.round((mistakes.length / totalPracticeSessions) * 10) / 10
      : 0,
  };
}

/** Get a human-readable summary of mistake stats */
export function summarizeStats(stats: MistakeStats): string {
  const topCat = [...ALL_CATEGORIES].sort((a, b) => stats.byCategory[b].count - stats.byCategory[a].count)[0];
  return [
    `共 ${stats.totalMistakes} 個錯誤記錄`,
    `最常見錯誤類型：${CATEGORY_LABELS[topCat]}（${stats.byCategory[topCat].count} 次）`,
    stats.topGrammarPoints.length > 0
      ? `最常見文法點：${stats.topGrammarPoints[0].grammarPoint}（${stats.topGrammarPoints[0].count} 次）`
      : '',
    `近 7 日新增：${stats.recent7Days} 個`,
    `待複習：${stats.pendingReviewCount} 個`,
    stats.mistakesPerSession > 0 ? `平均每次練習 ${stats.mistakesPerSession} 個錯誤` : '',
  ].filter(Boolean).join(' | ');
}
