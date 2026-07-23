// Sprint 33: ConfidenceEstimator — Bayesian Beta-Binomial mastery tracking
import { estimateMastery } from './learning-science';
import type { ReviewScheduleEntry } from '../types';

// ============================================
// ConfidenceEstimator — Bayesian Knowledge Tracing
// ============================================

export class ConfidenceEstimator {
  private readonly MASTERY_THRESHOLD = 0.80;
  private readonly MIN_EVIDENCE = 3;

  /** Update mastery estimate with new evidence */
  updateMastery(
    entry: ReviewScheduleEntry,
    correct: boolean,
    difficulty: number, // 1-5
  ): Pick<ReviewScheduleEntry, 'estimatedMastery' | 'masteryConfidence' | 'evidenceCount' | 'isMastered'> {
    // Build evidence array from history + new observation
    const evidence: Array<{ correct: boolean; difficulty: number }> = [];

    // Reconstruct approximate evidence from counts
    const totalPrior = entry.evidenceCount;
    if (totalPrior > 0) {
      const priorCorrect = entry.timesCorrect - (correct ? 1 : 0);
      const priorIncorrect = entry.timesIncorrect - (correct ? 0 : 1);
      for (let i = 0; i < Math.min(priorCorrect, 10); i++) {
        evidence.push({ correct: true, difficulty: entry.currentDifficulty === 'challenge' ? 4 : entry.currentDifficulty === 'core' ? 3 : 2 });
      }
      for (let i = 0; i < Math.min(priorIncorrect, 10); i++) {
        evidence.push({ correct: false, difficulty: entry.currentDifficulty === 'challenge' ? 4 : entry.currentDifficulty === 'core' ? 3 : 2 });
      }
    }

    // Add new evidence
    evidence.push({ correct, difficulty });

    // Use prior based on existing mastery estimate
    const result = estimateMastery(
      entry.estimatedMastery > 0 ? entry.estimatedMastery : 0.5,
      evidence,
    );

    // Confidence = narrower posterior = more evidence
    const confidence = Math.min(1, entry.evidenceCount / 10);

    return {
      estimatedMastery: Math.round(result.estimatedMastery * 1000) / 1000,
      masteryConfidence: Math.round(confidence * 100) / 100,
      evidenceCount: entry.evidenceCount + 1,
      isMastered: result.estimatedMastery >= this.MASTERY_THRESHOLD && (entry.evidenceCount + 1) >= this.MIN_EVIDENCE,
    };
  }

  /** Check if mastery is reliable (high confidence + above threshold) */
  isReliableMastery(entry: ReviewScheduleEntry): boolean {
    return entry.isMastered && entry.masteryConfidence >= 0.7;
  }

  /** Get mastery distribution across entries */
  getMasteryDistribution(entries: ReviewScheduleEntry[]): {
    mastered: number;
    learning: number;
    unknown: number;
  } {
    let mastered = 0, learning = 0, unknown = 0;
    for (const e of entries) {
      if (e.isMastered && e.masteryConfidence >= 0.7) mastered++;
      else if (e.estimatedMastery >= 0.4) learning++;
      else unknown++;
    }
    return { mastered, learning, unknown };
  }

  /** Estimate time to mastery (days) based on current trajectory */
  estimateTimeToMastery(entry: ReviewScheduleEntry): number | null {
    if (entry.isMastered) return 0;
    if (entry.evidenceCount < 2) return null;

    const gainPerReview = entry.estimatedMastery / Math.max(1, entry.evidenceCount);
    const remaining = this.MASTERY_THRESHOLD - entry.estimatedMastery;
    if (gainPerReview <= 0) return null;

    const reviewsNeeded = Math.ceil(remaining / gainPerReview);
    const avgInterval = Math.max(1, entry.interval);
    return reviewsNeeded * avgInterval;
  }
}

export const confidenceEstimator = new ConfidenceEstimator();
