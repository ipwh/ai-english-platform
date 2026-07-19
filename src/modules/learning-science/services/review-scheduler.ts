// Sprint 33: ReviewScheduler — SM-2 Enhanced + Forgetting Curve scheduling
import { sm2NextReview, createSRSState, isDueForReview, getDueItems, forgettingCurve, calculateReviewStrength } from './learning-science';
import type { ReviewScheduleEntry, ReviewUrgency } from '../types';

// ============================================
// ReviewScheduler — orchestrates SM-2 + Ebbinghaus
// ============================================

export class ReviewScheduler {

  /** Create a fresh schedule entry for a new item */
  createEntry(
    studentId: string,
    itemId: string,
    itemType: ReviewScheduleEntry['itemType'],
    opts?: {
      skillDimension?: string;
      title?: string;
      titleZh?: string;
      initialDifficulty?: ReviewScheduleEntry['currentDifficulty'];
    },
  ): ReviewScheduleEntry {
    const srs = createSRSState(itemId);
    return {
      studentId,
      itemId,
      itemType,
      skillDimension: opts?.skillDimension,
      title: opts?.title,
      titleZh: opts?.titleZh,
      interval: srs.interval,
      easeFactor: srs.easeFactor,
      repetitions: srs.repetitions,
      lapses: srs.lapses,
      quality: srs.quality,
      estimatedMastery: 0,
      masteryConfidence: 0,
      evidenceCount: 0,
      isMastered: false,
      currentDifficulty: opts?.initialDifficulty || 'core',
      difficultyAdjustment: 'maintain',
      adaptiveFactor: 1.0,
      retrievalStrength: 0,
      timesCorrect: 0,
      timesIncorrect: 0,
      reviewStrength: 1.0,
      retentionProbability: 1.0,
      lastReviewedAt: srs.lastReviewedAt,
      nextReviewAt: srs.nextReviewAt,
      reviewPriority: 0,
      reviewUrgency: 'low',
    };
  }

  /** Process a review result and update the schedule entry */
  processReview(entry: ReviewScheduleEntry, quality: number, correct: boolean): ReviewScheduleEntry {
    const srs = sm2NextReview({
      itemId: entry.itemId,
      interval: entry.interval,
      easeFactor: entry.easeFactor,
      repetitions: entry.repetitions,
      lastReviewedAt: entry.lastReviewedAt || new Date().toISOString(),
      nextReviewAt: entry.nextReviewAt,
      quality: entry.quality,
      lapses: entry.lapses,
    }, quality);

    const newStrength = calculateReviewStrength(
      srs.repetitions - (correct ? 0 : entry.repetitions),
      quality,
      0,
    );

    const newRetrieval = correct
      ? Math.min(1, entry.retrievalStrength + 0.15 * (1 - entry.retrievalStrength))
      : Math.max(0, entry.retrievalStrength * 0.85);

    const now = new Date();
    const hoursSinceReview = entry.lastReviewedAt
      ? (now.getTime() - new Date(entry.lastReviewedAt).getTime()) / 3600000
      : 0;
    const retention = forgettingCurve(hoursSinceReview * 60, newStrength);

    return {
      ...entry,
      interval: srs.interval,
      easeFactor: srs.easeFactor,
      repetitions: srs.repetitions,
      lapses: srs.lapses,
      quality: srs.quality,
      retrievalStrength: Math.round(newRetrieval * 100) / 100,
      timesCorrect: entry.timesCorrect + (correct ? 1 : 0),
      timesIncorrect: entry.timesIncorrect + (correct ? 0 : 1),
      reviewStrength: Math.round(newStrength * 100) / 100,
      retentionProbability: Math.round(retention * 1000) / 1000,
      lastReviewedAt: now.toISOString(),
      nextReviewAt: srs.nextReviewAt,
      reviewPriority: this.calculatePriority(srs, retention),
      reviewUrgency: this.calculateUrgency(srs, retention),
    };
  }

  /** Sort entries by review priority (highest first) */
  sortByPriority(entries: ReviewScheduleEntry[]): ReviewScheduleEntry[] {
    return [...entries].sort((a, b) => b.reviewPriority - a.reviewPriority);
  }

  /** Get entries due for review, sorted by urgency */
  getDueEntries(entries: ReviewScheduleEntry[], limit = 20): ReviewScheduleEntry[] {
    const due = entries.filter(e => isDueForReview({
      itemId: e.itemId,
      interval: e.interval,
      easeFactor: e.easeFactor,
      repetitions: e.repetitions,
      lastReviewedAt: e.lastReviewedAt || new Date().toISOString(),
      nextReviewAt: e.nextReviewAt,
      quality: e.quality,
      lapses: e.lapses,
    }));
    return this.sortByPriority(due).slice(0, limit);
  }

  /** Predict retention probability for an entry at current time */
  predictRetention(entry: ReviewScheduleEntry): number {
    const hoursSinceReview = entry.lastReviewedAt
      ? (Date.now() - new Date(entry.lastReviewedAt).getTime()) / 3600000
      : 24;
    return Math.round(forgettingCurve(hoursSinceReview * 60, entry.reviewStrength) * 1000) / 1000;
  }

  // ============================================
  // Priority calculation
  // ============================================

  private calculatePriority(srs: { interval: number; lapses: number }, retention: number): number {
    // High priority = low retention + lapsed + short interval
    const urgencyScore = (1 - retention) * 0.5
      + (srs.lapses > 0 ? 0.3 : 0)
      + Math.max(0, 1 - srs.interval / 30) * 0.2;
    return Math.round(Math.min(1, urgencyScore) * 100) / 100;
  }

  private calculateUrgency(srs: { interval: number; lapses: number }, retention: number): ReviewUrgency {
    if (retention < 0.3 || srs.lapses >= 3) return 'critical';
    if (retention < 0.5 || srs.lapses >= 1) return 'high';
    if (retention < 0.7) return 'medium';
    return 'low';
  }
}

export const reviewScheduler = new ReviewScheduler();
