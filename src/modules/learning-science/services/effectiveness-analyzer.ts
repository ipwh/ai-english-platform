// Sprint 33: LearningEffectivenessAnalyzer — measures learning ROI
import type { ReviewScheduleEntry, EffectivenessReport } from '../types';

// ============================================
// LearningEffectivenessAnalyzer
// ============================================

export class LearningEffectivenessAnalyzer {

  /** Generate a comprehensive effectiveness report */
  analyze(
    studentId: string,
    entries: ReviewScheduleEntry[],
    periodStart: string,
    periodEnd: string,
  ): EffectivenessReport {
    const periodEntries = entries.filter(e => {
      if (!e.lastReviewedAt) return false;
      const d = new Date(e.lastReviewedAt);
      return d >= new Date(periodStart) && d <= new Date(periodEnd);
    });

    // Average retention
    const avgRetention = periodEntries.length > 0
      ? periodEntries.reduce((s, e) => s + e.retentionProbability, 0) / periodEntries.length
      : 0;

    // Retention trend
    const sortedByDate = [...periodEntries].sort(
      (a, b) => new Date(a.lastReviewedAt!).getTime() - new Date(b.lastReviewedAt!).getTime(),
    );
    const half = Math.floor(sortedByDate.length / 2);
    const firstHalf = sortedByDate.slice(0, half);
    const secondHalf = sortedByDate.slice(half);
    const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((s, e) => s + e.retentionProbability, 0) / firstHalf.length : 0;
    const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((s, e) => s + e.retentionProbability, 0) / secondHalf.length : 0;

    let retentionTrend: EffectivenessReport['metrics']['retentionTrend'] = 'stable';
    if (secondAvg - firstAvg > 0.05) retentionTrend = 'improving';
    else if (firstAvg - secondAvg > 0.05) retentionTrend = 'declining';

    // Mastery stats
    const masteryEntries = entries.filter(e => e.isMastered);
    const avgMasteryGain = periodEntries.length > 0
      ? periodEntries.reduce((s, e) => s + e.estimatedMastery, 0) / periodEntries.length
      : 0;

    const itemsMastered = periodEntries.filter(e => e.isMastered).length;
    const itemsRegressed = periodEntries.filter(
      e => !e.isMastered && e.evidenceCount > 3 && e.estimatedMastery < 0.5,
    ).length;

    // Optimal difficulty rate
    const inOptimalZone = periodEntries.filter(e => {
      const total = e.timesCorrect + e.timesIncorrect;
      const acc = total > 0 ? e.timesCorrect / total : 0;
      return acc >= 0.70 && acc <= 0.85;
    }).length;
    const optimalRate = periodEntries.length > 0 ? inOptimalZone / periodEntries.length : 0;

    // Review compliance
    const now = new Date();
    const allDue = entries.filter(e => new Date(e.nextReviewAt) <= now);
    const overdue = allDue.filter(e => {
      if (!e.lastReviewedAt) return true;
      return new Date(e.lastReviewedAt) < new Date(e.nextReviewAt);
    });
    const compliance = allDue.length > 0 ? 1 - overdue.length / allDue.length : 1;

    // Time to mastery
    const masteredWithHistory = masteryEntries.filter(e => e.evidenceCount >= 2);
    const avgTimeToMastery = masteredWithHistory.length > 0
      ? masteredWithHistory.reduce((s, e) => {
        const created = new Date(e.lastReviewedAt || e.nextReviewAt);
        const now2 = new Date();
        return s + (now2.getTime() - created.getTime()) / 86400000;
      }, 0) / masteredWithHistory.length
      : 0;

    // Calibration: average gap between estimated mastery and actual accuracy
    const avgCalibration = periodEntries.length > 0
      ? periodEntries.reduce((s, e) => {
        const total = e.timesCorrect + e.timesIncorrect;
        const actual = total > 0 ? e.timesCorrect / total : 0;
        return s + Math.abs(e.estimatedMastery - actual);
      }, 0) / periodEntries.length
      : 0;

    const recommendations = this.generateRecommendations({
      avgRetention, retentionTrend, avgMasteryGain, itemsMastered,
      itemsRegressed, optimalRate, compliance, avgCalibration, avgTimeToMastery,
    });

    return {
      studentId,
      period: { start: periodStart, end: periodEnd },
      metrics: {
        averageRetention: Math.round(avgRetention * 1000) / 1000,
        retentionTrend,
        averageMasteryGain: Math.round(avgMasteryGain * 100) / 100,
        itemsMastered,
        itemsRegressed,
        optimalDifficultyRate: Math.round(optimalRate * 100) / 100,
        averageCalibration: Math.round(avgCalibration * 100) / 100,
        reviewCompliance: Math.round(compliance * 100) / 100,
        timeToMastery: Math.round(avgTimeToMastery * 10) / 10,
      },
      recommendations: recommendations.en,
      recommendationsZh: recommendations.zh,
    };
  }

  private generateRecommendations(metrics: {
    avgRetention: number; retentionTrend: string; avgMasteryGain: number;
    itemsMastered: number; itemsRegressed: number; optimalRate: number;
    compliance: number; avgCalibration: number; avgTimeToMastery: number;
  }): { en: string[]; zh: string[] } {
    const en: string[] = [];
    const zh: string[] = [];

    if (metrics.avgRetention < 0.5) {
      en.push('Retention is low. Increase review frequency and consider interleaving topics.');
      zh.push('記憶保留率偏低。建議增加複習頻率，並嘗試混合不同主題練習。');
    }
    if (metrics.retentionTrend === 'declining') {
      en.push('Retention is declining. Review sessions may be too infrequent.');
      zh.push('記憶保留率正在下降。複習間隔可能太長。');
    }
    if (metrics.optimalRate < 0.3) {
      en.push('Few items are in the optimal difficulty zone (70-85%). Adjust difficulty levels.');
      zh.push('只有少數項目在最佳難度區間（70-85%）。請調整難度設定。');
    }
    if (metrics.compliance < 0.5) {
      en.push('Review compliance is low. Consider shorter, more frequent sessions.');
      zh.push('複習完成率偏低。建議縮短每次練習時間，增加練習頻率。');
    }
    if (metrics.itemsRegressed > 0) {
      en.push(`${metrics.itemsRegressed} items have regressed. Schedule intensive review.`);
      zh.push(`${metrics.itemsRegressed} 個項目已退化。請安排密集複習。`);
    }
    if (metrics.avgCalibration > 0.3) {
      en.push('Self-assessment calibration gap is wide. Use more reflection prompts.');
      zh.push('自我評估與實際表現差距較大。建議增加反思提示。');
    }
    if (en.length === 0) {
      en.push('Learning effectiveness is good. Maintain current strategies and gradually increase difficulty.');
      zh.push('學習效能良好。維持當前策略，逐步提升難度。');
    }

    return { en, zh };
  }
}

export const learningEffectivenessAnalyzer = new LearningEffectivenessAnalyzer();
