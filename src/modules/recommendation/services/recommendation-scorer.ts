// Sprint 22: Recommendation Scorer — deterministic multi-factor scoring
import type {
  ScoredRecommendation, Recommendation, ScoreFactors,
  RecommendationInput, StrategyContext,
} from '../types';

// ============================================
// Factor Weights (must sum to 1.0)
// ============================================

const WEIGHTS: Record<keyof ScoreFactors, number> = {
  masteryGap: 0.30,
  recency: 0.15,
  mistakeFrequency: 0.15,
  preferenceMatch: 0.08,
  pathPosition: 0.10,
  prerequisiteReadiness: 0.10,
  timeFit: 0.05,
  streakBonus: 0.03,
  srsUrgency: 0.04,
};

// ============================================
// Factor Computation
// ============================================

function computeMasteryGap(rec: Recommendation, input: RecommendationInput): number {
  const mastery = input.masteryScores.find(m => m.nodeId === rec.nodeId);
  if (!mastery) return 0;
  const gap = mastery.masteryThreshold - mastery.currentMastery;
  return clamp(gap / 100, 0, 1);
}

function computeRecency(rec: Recommendation, input: RecommendationInput): number {
  const mastery = input.masteryScores.find(m => m.nodeId === rec.nodeId);
  if (!mastery) return 0;
  // Higher = more urgent (longer since last practice)
  return clamp(mastery.daysSinceLastPractice / 14, 0, 1);
}

function computeMistakeFrequency(rec: Recommendation, input: RecommendationInput): number {
  const { mistakeStats } = input;
  if (mistakeStats.totalMistakes === 0) return 0;

  // Map skill to category for mistake lookup
  const skillToCat: Record<string, string> = {
    grammar: 'grammar', vocabulary: 'vocabulary',
    reading: 'comprehension', listening: 'comprehension',
    writing: 'chinglish', speaking: 'grammar',
  };
  const cat = skillToCat[rec.skill] || 'grammar';
  const catMistakes = mistakeStats.byCategory[cat] || 0;
  return clamp(catMistakes / Math.max(mistakeStats.totalMistakes, 1), 0, 1);
}

function computePreferenceMatch(rec: Recommendation, input: RecommendationInput): number {
  if (input.preferredTopics.length === 0) return 0.3; // Neutral
  const topTopics = input.preferredTopics.slice(0, 3);
  const match = topTopics.some(t =>
    rec.title.toLowerCase().includes(t.topic.toLowerCase()) ||
    rec.titleZh.includes(t.topic)
  );
  return match ? 0.8 : 0.2;
}

function computePathPosition(rec: Recommendation, _input: RecommendationInput): number {
  // Strategy-based: weakness strategies get higher path position
  if (rec.strategy === 'weakness-exercise') return 0.9;
  if (rec.strategy === 'learning-path') return 0.7;
  if (rec.strategy === 'spaced-repetition') return 0.5;
  return 0.4;
}

function computePrerequisiteReadiness(rec: Recommendation, input: RecommendationInput): number {
  // Check if student's overall readiness supports this recommendation
  const mastery = input.masteryScores.find(m => m.nodeId === rec.nodeId);
  if (!mastery) return 0.5;
  if (mastery.totalAttempts === 0) return 0.3; // Never attempted
  if (mastery.totalAttempts >= 3) return 0.8; // Ready
  return 0.5;
}

function computeTimeFit(rec: Recommendation, input: RecommendationInput): number {
  if (input.availableStudyTime <= 0) return 0.5;
  const ratio = rec.estimatedTime / input.availableStudyTime;
  if (ratio <= 0.25) return 1;    // Perfect fit
  if (ratio <= 0.5) return 0.8;
  if (ratio <= 0.75) return 0.5;
  return 0.2; // Too long
}

function computeStreakBonus(_rec: Recommendation, input: RecommendationInput): number {
  const streak = input.learningProfile.currentStreak;
  if (streak >= 7) return 1;
  if (streak >= 3) return 0.6;
  if (streak >= 1) return 0.3;
  return 0;
}

function computeSrsUrgency(rec: Recommendation, input: RecommendationInput): number {
  if (rec.type === 'vocabulary-review') {
    const due = input.learningProfile.vocabularyStats.dueForReview;
    return clamp(due / 30, 0, 1);
  }
  if (rec.type === 'review-exercise') {
    const mastery = input.masteryScores.find(m => m.nodeId === rec.nodeId);
    if (!mastery) return 0;
    return clamp(mastery.daysSinceLastPractice / 21, 0, 1);
  }
  return 0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ============================================
// Main Scorer
// ============================================

export function scoreRecommendation(
  rec: Recommendation,
  input: RecommendationInput,
): ScoredRecommendation {
  const factors: ScoreFactors = {
    masteryGap: computeMasteryGap(rec, input),
    recency: computeRecency(rec, input),
    mistakeFrequency: computeMistakeFrequency(rec, input),
    preferenceMatch: computePreferenceMatch(rec, input),
    pathPosition: computePathPosition(rec, input),
    prerequisiteReadiness: computePrerequisiteReadiness(rec, input),
    timeFit: computeTimeFit(rec, input),
    streakBonus: computeStreakBonus(rec, input),
    srsUrgency: computeSrsUrgency(rec, input),
  };

  // Weighted composite score (0-100)
  let compositeScore = 0;
  for (const [key, weight] of Object.entries(WEIGHTS) as [keyof ScoreFactors, number][]) {
    compositeScore += factors[key] * weight * 100;
  }

  return {
    ...rec,
    scoreFactors: factors,
    compositeScore: clamp(Math.round(compositeScore), 0, 100),
  };
}

export function scoreAll(
  recommendations: Recommendation[],
  input: RecommendationInput,
): ScoredRecommendation[] {
  return recommendations
    .map(r => scoreRecommendation(r, input))
    .sort((a, b) => {
      // Priority first
      const priorityOrder = { 'must-do': 0, 'should-do': 1, 'could-do': 2 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      // Then composite score
      return b.compositeScore - a.compositeScore;
    });
}

export function getConfidenceBand(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
