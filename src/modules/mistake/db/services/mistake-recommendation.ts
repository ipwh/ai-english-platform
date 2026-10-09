// Sprint 9: Mistake Recommendation — generates review/practice/lesson recommendations
import type { MistakeRecord, MistakeRecommendation } from '../types';
import { analyzeMistakes } from './mistake-analytics';
import { extractGrammarPoint, getDueForReview, estimateCategoryMastery } from './mistake-tracker';

/**
 * Generate personalized recommendations based on mistake patterns.
 * Priority: due reviews → high-frequency grammar points → weak categories
 */
export function generateMistakeRecommendations(
  mistakes: MistakeRecord[],
  totalPracticeSessions: number
): MistakeRecommendation[] {
  const stats = analyzeMistakes(mistakes, totalPracticeSessions);
  const results: MistakeRecommendation[] = [];

  // 1. Due reviews (high priority)
  const dueForReview = getDueForReview(mistakes);
  if (dueForReview.length > 0) {
    results.push({
      type: 'review',
      priority: 'high',
      category: 'grammar',
      target: `due-reviews`,
      targetZh: `待複習錯題`,
      reason: `你有 ${dueForReview.length} 個錯題需要複習`,
      mistakeCount: dueForReview.length,
      practiceCount: Math.min(dueForReview.length, 10),
    });
  }

  // 2. Top grammar points (medium-high priority)
  for (const gp of stats.topGrammarPoints.slice(0, 3)) {
    if (gp.count < 2) continue;
    const mastery = estimateCategoryMastery(
      mistakes.filter(m => extractGrammarPoint(m.questionSummary) === gp.grammarPoint),
      'grammar'
    );
    results.push({
      type: 'practice',
      priority: gp.count >= 5 ? 'high' : 'medium',
      category: 'grammar',
      target: gp.grammarPoint,
      targetZh: gp.grammarPoint,
      reason: `${gp.grammarPoint} 錯誤 ${gp.count} 次（精熟度 ${mastery}%）`,
      mistakeCount: gp.count,
      practiceCount: Math.min(gp.count * 2, 10),
    });
  }

  // 3. Critical comprehension issues
  if (stats.byCategory.comprehension.count >= 3) {
    results.push({
      type: 'lesson',
      priority: 'high',
      category: 'comprehension',
      target: 'reading-strategies',
      targetZh: '閱讀策略',
      reason: `理解錯誤 ${stats.byCategory.comprehension.count} 次，建議加強閱讀策略`,
      mistakeCount: stats.byCategory.comprehension.count,
      practiceCount: 5,
    });
  }

  // 4. Time management issues
  if (stats.byCategory['time-management'].count >= 2) {
    results.push({
      type: 'practice',
      priority: 'medium',
      category: 'time-management',
      target: 'timed-practice',
      targetZh: '限時練習',
      reason: `時間管理問題 ${stats.byCategory['time-management'].count} 次`,
      mistakeCount: stats.byCategory['time-management'].count,
      practiceCount: 3,
    });
  }

  // 5. Chinglish pattern
  if (stats.byCategory.chinglish.count >= 3) {
    results.push({
      type: 'lesson',
      priority: 'medium',
      category: 'chinglish',
      target: 'chinglish-fixes',
      targetZh: '中式英文修正',
      reason: `中式英文 ${stats.byCategory.chinglish.count} 次`,
      mistakeCount: stats.byCategory.chinglish.count,
      practiceCount: 5,
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return results.slice(0, 5);
}
