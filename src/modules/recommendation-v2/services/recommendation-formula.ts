// Sprint 33: Pure recommendation ranking algorithm — no DB dependencies (testable without Prisma)
import type { RecommendationCandidate, ScoredRecommendation } from '../types';

// ============================================
// Algorithm Weights (as specified in Sprint 33)
// ============================================
export const WEAKNESS_WEIGHT = 0.40;
export const RECENT_MISTAKES_WEIGHT = 0.30;
export const EXAM_IMPORTANCE_WEIGHT = 0.20;
export const RETENTION_DECAY_WEIGHT = 0.10;

/** Maximum days for retention decay calculation (fully decayed after 30 days) */
export const MAX_RETENTION_DAYS = 30;

/** Maximum mistake count for normalization (capped at this value) */
export const MAX_MISTAKE_CAP = 20;

/**
 * Score a single recommendation candidate using the Sprint 33 algorithm.
 *
 * Components:
 * - Weakness (40%): (1 - masteryScore/100) — lower mastery = higher score
 * - Recent mistakes (30%): normalizedMistakes — more mistakes = higher score
 * - Exam importance (20%): examWeight — higher DSE weight = higher score
 * - Retention decay (10%): daysSincePractice / MAX_RETENTION_DAYS — longer gap = higher score
 *
 * All components are normalized 0-1, so totalScore is 0-1 (higher = more recommended).
 */
export function scoreCandidate(candidate: RecommendationCandidate): ScoredRecommendation {
  const { masteryScore, mistakeCount, examWeight, daysSinceLastPractice } = candidate;

  // 1. Weakness: invert mastery so lower mastery → higher score
  const weaknessScore = (1 - masteryScore / 100) * WEAKNESS_WEIGHT;

  // 2. Recent mistakes: normalize mistake count (cap at MAX_MISTAKE_CAP)
  const normalizedMistakes = Math.min(mistakeCount / MAX_MISTAKE_CAP, 1);
  const mistakeScore = normalizedMistakes * RECENT_MISTAKES_WEIGHT;

  // 3. Exam importance: use the provided exam weight (already 0-1 normalized)
  const examScore = examWeight * EXAM_IMPORTANCE_WEIGHT;

  // 4. Retention decay: more days since last practice = more urgent
  const retentionRatio = Math.min(daysSinceLastPractice / MAX_RETENTION_DAYS, 1);
  const retentionScore = retentionRatio * RETENTION_DECAY_WEIGHT;

  const totalScore = weaknessScore + mistakeScore + examScore + retentionScore;

  return {
    candidate,
    totalScore: Math.round(totalScore * 10000) / 10000,
    breakdown: {
      weaknessScore: Math.round(weaknessScore * 10000) / 10000,
      mistakeScore: Math.round(mistakeScore * 10000) / 10000,
      examScore: Math.round(examScore * 10000) / 10000,
      retentionScore: Math.round(retentionScore * 10000) / 10000,
    },
    rank: 0, // Will be set by ranking function
  };
}

/**
 * Rank a list of candidates by their total score (descending).
 */
export function rankCandidates(candidates: RecommendationCandidate[]): ScoredRecommendation[] {
  const scored = candidates.map(scoreCandidate);
  scored.sort((a, b) => b.totalScore - a.totalScore);
  scored.forEach((s, i) => { s.rank = i + 1; });
  return scored;
}

/**
 * Filter candidates by type and return top N.
 */
export function getTopRecommendations(
  candidates: RecommendationCandidate[],
  type?: RecommendationCandidate['type'],
  limit = 5,
): ScoredRecommendation[] {
  const filtered = type ? candidates.filter(c => c.type === type) : candidates;
  return rankCandidates(filtered).slice(0, limit);
}
