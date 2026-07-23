// Sprint 31: Pure mastery calculation — no DB dependency (testable without Prisma)

// ============================================
// Mastery Formula Constants
// ============================================
export const ACCURACY_WEIGHT = 0.45;
export const PRACTICE_FREQ_WEIGHT = 0.20;
export const RECENCY_WEIGHT = 0.20;
export const MISTAKE_PENALTY_WEIGHT = 0.15;
export const DECAY_DAYS = 14;
export const MIN_PRACTICES_FOR_CONFIDENCE = 3;

/**
 * Calculate mastery score (0-100) based on:
 * - accuracy (45%): correct / total
 * - practice frequency (20%): min(1, practiceCount / 5)
 * - recency (20%): 1.0 today → 0.5 after DECAY_DAYS
 * - mistake penalty (15%): 1 - (mistakeCount / max(practiceCount, 1))
 */
export function calculateMasteryScore(params: {
  correctCount: number;
  practiceCount: number;
  mistakeCount: number;
  lastPracticedAt: Date | null;
}): { masteryScore: number; confidenceScore: number; retentionScore: number } {
  const { correctCount, practiceCount, mistakeCount, lastPracticedAt } = params;

  if (practiceCount === 0) {
    return { masteryScore: 0, confidenceScore: 0, retentionScore: 0 };
  }

  const accuracy = correctCount / practiceCount;
  const freqFactor = Math.min(1.0, practiceCount / 5);
  const now = new Date();
  const daysSince = lastPracticedAt
    ? Math.max(0, Math.floor((now.getTime() - lastPracticedAt.getTime()) / 86400000))
    : 999;
  const recencyFactor = Math.max(0.3, 1.0 - (daysSince / DECAY_DAYS) * 0.7);
  const mistakeRatio = mistakeCount / Math.max(practiceCount, 1);
  const mistakeFactor = Math.max(0.2, 1.0 - mistakeRatio);

  const rawScore = (
    accuracy * ACCURACY_WEIGHT +
    freqFactor * PRACTICE_FREQ_WEIGHT +
    recencyFactor * RECENCY_WEIGHT +
    mistakeFactor * MISTAKE_PENALTY_WEIGHT
  ) * 100;

  const confidenceScore = Math.min(100, Math.round((practiceCount / (practiceCount + MIN_PRACTICES_FOR_CONFIDENCE)) * 100));
  const retentionScore = Math.round(recencyFactor * 100);

  return {
    masteryScore: Math.round(rawScore),
    confidenceScore,
    retentionScore,
  };
}
