// Sprint 32: Mistake Intelligence Service — orchestrates repo + existing mistake-db
import type { WeaknessProfile, WeaknessItem, TrendDirection } from '../types';
import { GRAMMAR_CATEGORY_LABELS } from '../types';
import { getTopWeaknesses, getRecurringMistakes, getStudentSummaries, aggregateMistakes } from '../repositories/mistake-intelligence-repo';
import { calculateTrend, calculateWeaknessSeverityScore, isPersistentWeakness } from './mistake-intelligence-formula';
import { bucketKeyLabelZh } from './mistake-skill-breakdown';

/**
 * Category label lookup with fallback.
 * 2026-09-14: categories are now skill/type bucket keys (`reading:inference`,
 * `grammar:tenses-simple`) — fall back to the bucket label resolver before
 * showing the raw key.
 */
function getCategoryZh(category: string): string {
  return GRAMMAR_CATEGORY_LABELS[category] ?? bucketKeyLabelZh(category) ?? category;
}

/**
 * Build a full WeaknessProfile for a student.
 * Reuses existing mistake-db analytics via aggregateMistakes().
 */
export async function buildWeaknessProfile(
  studentId: string,
  limit = 10,
  includeRecommendations = true,
): Promise<WeaknessProfile> {
  // Ensure summaries are up-to-date
  await aggregateMistakes(studentId);

  // Fetch from DB
  const [topWeaknesses, recurring] = await Promise.all([
    getTopWeaknesses(studentId, limit),
    getRecurringMistakes(studentId),
  ]);

  // Map to WeaknessItem[]
  const toWeaknessItem = (s: {
    grammarCategory: string;
    mistakeCount: number;
    lastSeen: Date;
    severity: string;
    mastered: boolean;
    trend: string;
  }): WeaknessItem => ({
    grammarCategory: s.grammarCategory,
    grammarCategoryZh: getCategoryZh(s.grammarCategory),
    mistakeCount: s.mistakeCount,
    severity: s.severity as WeaknessItem['severity'],
    trend: s.trend as TrendDirection,
    mastered: s.mastered,
    lastSeen: s.lastSeen,
  });

  const topItems = topWeaknesses.map(toWeaknessItem);
  const recurringItems = recurring.map(toWeaknessItem);

  // Overall trend: aggregate all weekly trends
  const trends = topWeaknesses.map(w => w.trend as TrendDirection);
  const improvementTrend = computeOverallTrend(trends);

  // Generate recommendations
  const recommendations: string[] = [];
  if (includeRecommendations) {
    for (const w of topItems.slice(0, 5)) {
      const persistent = isPersistentWeakness({
        mistakeCount: w.mistakeCount,
        trend: w.trend,
        severity: w.severity,
      });
      if (persistent) {
        recommendations.push(
          `${w.grammarCategoryZh}（${w.grammarCategory}）已錯 ${w.mistakeCount} 次，建議重點複習`,
        );
      }
    }
    if (improvementTrend === 'worsening') {
      recommendations.push('整體錯誤趨勢上升，建議增加練習頻率');
    } else if (improvementTrend === 'improving') {
      recommendations.push('整體錯誤趨勢下降，繼續保持！');
    }
  }

  return {
    studentId,
    topWeaknesses: topItems,
    mostFrequentMistakes: recurringItems,
    improvementTrend,
    recommendations,
    generatedAt: new Date(),
  };
}

/**
 * Compute overall trend from a list of per-category trends.
 */
function computeOverallTrend(trends: TrendDirection[]): TrendDirection {
  if (trends.length === 0) return 'stable';
  const improving = trends.filter(t => t === 'improving').length;
  const worsening = trends.filter(t => t === 'worsening').length;
  if (worsening > improving) return 'worsening';
  if (improving > worsening) return 'improving';
  return 'stable';
}
