// Sprint 30: AI Learning Science — all 7 evidence-based techniques
import type {
  SpacedRepetitionState, ForgettingCurvePoint,
  RetrievalPracticeSession, RetrievalItem, InterleavingPlan, InterleavingBlock,
  DesirableDifficultyConfig, MetacognitionPrompt,
  ConfidenceWeightedMastery, LearningScienceReport,
} from '../types';

// ============================================
// 1. SPACED REPETITION (SM-2 Enhanced)
// ============================================

export function sm2NextReview(state: SpacedRepetitionState, quality: number): SpacedRepetitionState {
  const now = new Date();
  const q = Math.max(0, Math.min(5, quality));

  if (q < 3) {
    // Failed — reset
    return {
      ...state,
      interval: 1,
      repetitions: 0,
      easeFactor: Math.max(1.3, state.easeFactor - 0.2),
      lastReviewedAt: now.toISOString(),
      nextReviewAt: addDays(now, 1).toISOString(),
      quality: q,
      lapses: state.lapses + 1,
    };
  }

  // Passed — SM-2 algorithm
  let newInterval: number;
  if (state.repetitions === 0) newInterval = 1;
  else if (state.repetitions === 1) newInterval = 6;
  else newInterval = Math.round(state.interval * state.easeFactor);

  const newEaseFactor = state.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const clampedEf = Math.max(1.3, newEaseFactor);

  return {
    ...state,
    interval: newInterval,
    repetitions: state.repetitions + 1,
    easeFactor: Math.round(clampedEf * 100) / 100,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: addDays(now, newInterval).toISOString(),
    quality: q,
    lapses: state.lapses,
  };
}

export function createSRSState(itemId: string): SpacedRepetitionState {
  return {
    itemId, interval: 0, easeFactor: 2.5, repetitions: 0,
    lastReviewedAt: new Date().toISOString(),
    nextReviewAt: new Date().toISOString(),
    quality: 0, lapses: 0,
  };
}

export function isDueForReview(state: SpacedRepetitionState): boolean {
  return new Date(state.nextReviewAt) <= new Date();
}

export function getDueItems(states: SpacedRepetitionState[], limit = 20): SpacedRepetitionState[] {
  return states
    .filter(s => isDueForReview(s))
    .sort((a, b) => {
      // Priority: lapsed items first, then by interval (shortest first)
      if (a.lapses > 0 && b.lapses === 0) return -1;
      if (b.lapses > 0 && a.lapses === 0) return 1;
      return a.interval - b.interval;
    })
    .slice(0, limit);
}

// ============================================
// 2. FORGETTING CURVE (Ebbinghaus)
// ============================================

/**
 * Ebbinghaus forgetting curve: R = e^(-t/S)
 * R = retention probability, t = elapsed time, S = strength (relative memory strength)
 */
export function forgettingCurve(elapsedMinutes: number, strength = 1.0): number {
  // S is proportional to repetition count and quality
  const S = strength * 60; // Scale: strength 1.0 → half-life ~42 min (matches Ebbinghaus)
  return Math.exp(-elapsedMinutes / S);
}

export function generateForgettingCurve(strength = 1.0, maxHours = 48): ForgettingCurvePoint[] {
  const points: ForgettingCurvePoint[] = [];
  for (let minutes = 0; minutes <= maxHours * 60; minutes += 15) {
    points.push({
      elapsedMinutes: minutes,
      retentionProbability: Math.round(forgettingCurve(minutes, strength) * 1000) / 1000,
    });
  }
  return points;
}

export function optimalReviewTime(strength: number, targetRetention = 0.8): number {
  // Solve R = e^(-t/S) for t: t = -S * ln(R)
  const S = strength * 60;
  const t = -S * Math.log(targetRetention);
  return Math.round(t / 60 * 10) / 10; // hours
}

export function calculateReviewStrength(repetitions: number, avgQuality: number, daysSinceLastReview: number): number {
  const repetitionBonus = Math.min(2, 1 + repetitions * 0.15);
  const qualityFactor = avgQuality / 5;
  const decayFactor = Math.exp(-daysSinceLastReview / 7);
  return repetitionBonus * qualityFactor * decayFactor;
}

// ============================================
// 3. RETRIEVAL PRACTICE (Active Recall)
// ============================================

export function scheduleRetrievalPractice(items: RetrievalItem[], mode: RetrievalPracticeSession['schedule']): RetrievalPracticeSession {
  const sorted = [...items].sort((a, b) => a.retrievalStrength - b.retrievalStrength);

  const schedule: RetrievalPracticeSession['schedule'] = mode;
  let difficulty: RetrievalPracticeSession['difficulty'] = 'medium';

  const avgStrength = items.length > 0 ? items.reduce((s, i) => s + i.retrievalStrength, 0) / items.length : 0;
  if (avgStrength < 0.3) difficulty = 'easy';
  else if (avgStrength > 0.7) difficulty = 'hard';

  return {
    sessionId: `rp_${Date.now()}`,
    items: sorted,
    schedule,
    difficulty,
  };
}

export function updateRetrievalStrength(item: RetrievalItem, correct: boolean): RetrievalItem {
  const alpha = 0.15;
  const newStrength = correct
    ? Math.min(1, item.retrievalStrength + alpha * (1 - item.retrievalStrength))
    : Math.max(0, item.retrievalStrength * (1 - alpha));

  return {
    ...item,
    retrievalStrength: Math.round(newStrength * 100) / 100,
    timesCorrect: item.timesCorrect + (correct ? 1 : 0),
    timesIncorrect: item.timesIncorrect + (correct ? 0 : 1),
    lastAttempted: new Date().toISOString(),
  };
}

// ============================================
// 4. INTERLEAVING (Mixed Practice)
// ============================================

export function generateInterleavingPlan(topics: string[], itemsPerTopic: Record<string, number>): InterleavingPlan {
  const blocks: InterleavingBlock[] = [];

  // Interleaving: alternate topics rather than block them
  const maxItems = Math.max(...Object.values(itemsPerTopic), 1);

  for (let i = 0; i < maxItems; i++) {
    // Shuffle topic order each round
    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    for (const topic of shuffled) {
      if ((itemsPerTopic[topic] || 0) > i) {
        blocks.push({
          topic,
          itemCount: 1,
          difficulty: Math.min(5, 2 + Math.floor(i / 3)),
          type: i === 0 ? 'new' : i < maxItems / 2 ? 'review' : 'challenge',
        });
      }
    }
  }

  return {
    topics,
    sequence: blocks,
    rationale: `Interleaving ${topics.length} topics across ${blocks.length} practice items. Mixing topics improves long-term retention and transfer by 25-43% compared to blocked practice (Rohrer & Taylor, 2007).`,
  };
}

// ============================================
// 5. DESIRABLE DIFFICULTY (Optimal Challenge)
// ============================================

export function calculateDesirableDifficulty(currentAccuracy: number, recentAccuracy: number): DesirableDifficultyConfig {
  const targetAccuracy = 0.75; // Sweet spot: 70-85%
  let adjustment: DesirableDifficultyConfig['adjustment'];
  let suggestedDifficulty: DesirableDifficultyConfig['suggestedDifficulty'];
  let adaptiveFactor: number;

  if (currentAccuracy > 0.85) {
    adjustment = 'increase';
    suggestedDifficulty = 'challenge';
    adaptiveFactor = 1.3;
  } else if (currentAccuracy < 0.55) {
    adjustment = 'decrease';
    suggestedDifficulty = 'remedial';
    adaptiveFactor = 0.7;
  } else {
    adjustment = 'maintain';
    suggestedDifficulty = 'core';
    adaptiveFactor = 1.0;
  }

  return {
    targetAccuracy,
    currentAccuracy,
    adjustment,
    suggestedDifficulty,
    adaptiveFactor,
  };
}

export function optimalDifficultyLevel(masteryScore: number, streakDays: number): number {
  // Vygotsky's Zone of Proximal Development: push slightly beyond current level
  const baseLevel = Math.ceil(masteryScore / 20); // 0-100 → 1-5
  const streakBonus = Math.min(2, Math.floor(streakDays / 3));
  return Math.min(5, Math.max(1, baseLevel + streakBonus));
}

// ============================================
// 6. METACOGNITION (Self-assessment + Calibration)
// ============================================

export function generateMetacognitionPrompts(topic: string, topicZh: string): MetacognitionPrompt {
  return {
    beforePractice: [
      `How confident are you in your understanding of "${topic}"? (1-5)`,
      `What do you already know about this topic?`,
      `What specific aspects do you find challenging?`,
      `What strategy will you use to practice this topic?`,
    ],
    afterPractice: [
      `How did your actual performance compare to your prediction?`,
      `What did you learn that you didn't know before?`,
      `Which questions surprised you, and why?`,
      `What will you do differently next time?`,
    ],
    selfAssessmentScale: 5,
    calibrationGap: 0, // To be filled after practice
  };
}

export function calculateCalibration(
  selfAssessedLevel: number,   // 1-5
  actualAccuracy: number,       // 0-1
): { calibrationGap: number; overconfident: boolean; feedback: string; feedbackZh: string } {
  const normalizedSelf = (selfAssessedLevel - 1) / 4; // 1-5 → 0-1
  const gap = normalizedSelf - actualAccuracy;
  const overconfident = gap > 0.1;

  let feedback: string, feedbackZh: string;
  if (Math.abs(gap) < 0.1) {
    feedback = 'Excellent calibration! Your self-assessment matches your actual performance.';
    feedbackZh = '自我評估非常準確！你的自我評估與實際表現一致。';
  } else if (overconfident) {
    feedback = `You are overconfident by ${Math.round(Math.abs(gap) * 100)}%. Your actual accuracy is lower than your self-assessment. Consider more careful self-monitoring.`;
    feedbackZh = `你高估了自己約 ${Math.round(Math.abs(gap) * 100)}%。實際表現低於自我評估，建議更仔細地自我監控。`;
  } else {
    feedback = `You are underestimating yourself by ${Math.round(Math.abs(gap) * 100)}%. Your actual performance is better than you think. Build confidence!`;
    feedbackZh = `你低估了自己約 ${Math.round(Math.abs(gap) * 100)}%。實際表現比你想像中好，建立信心！`;
  }

  return { calibrationGap: Math.round(gap * 100) / 100, overconfident, feedback, feedbackZh };
}

// ============================================
// 7. CONFIDENCE-BASED MASTERY (Bayesian Knowledge Tracing)
// ============================================

export function estimateMastery(
  priorMastery: number,
  evidence: Array<{ correct: boolean; difficulty: number }>,
): ConfidenceWeightedMastery {
  if (evidence.length === 0) {
    return {
      itemId: 'unknown', estimatedMastery: priorMastery, confidence: 0.1,
      lastUpdated: new Date().toISOString(), priorMastery,
      evidenceStrength: 0, isMastered: false,
    };
  }

  // Bayesian update: P(mastery | evidence) ∝ P(evidence | mastery) * P(mastery)
  let posteriorMean = priorMastery;
  let posteriorVariance = 0.25; // High initial uncertainty

  for (const e of evidence) {
    // Likelihood: if mastered, P(correct) = 0.9 - 0.1*difficulty/5; if not, P(correct) = 0.25
    const slipProbability = 0.1 + (e.difficulty / 5) * 0.25;  // Mastered but slipped
    const guessProbability = 0.25;                               // Not mastered but guessed

    const likelihoodCorrect = posteriorMean * (1 - slipProbability) + (1 - posteriorMean) * guessProbability;
    const likelihoodObserved = e.correct ? likelihoodCorrect : (1 - likelihoodCorrect);

    // Simplified Bayesian update using Beta-Bernoulli conjugate
    const alpha = posteriorMean * ((posteriorMean * (1 - posteriorMean) / Math.max(posteriorVariance, 0.01)) - 1);
    const beta = (1 - posteriorMean) * ((posteriorMean * (1 - posteriorMean) / Math.max(posteriorVariance, 0.01)) - 1);

    const newAlpha = Math.max(1, alpha + (e.correct ? 1 : 0));
    const newBeta = Math.max(1, beta + (e.correct ? 0 : 1));

    posteriorMean = newAlpha / (newAlpha + newBeta);
    posteriorVariance = (newAlpha * newBeta) / ((newAlpha + newBeta) ** 2 * (newAlpha + newBeta + 1));
  }

  return {
    itemId: 'item',
    estimatedMastery: Math.round(posteriorMean * 100) / 100,
    confidence: Math.round((1 - Math.sqrt(posteriorVariance)) * 100) / 100,
    lastUpdated: new Date().toISOString(),
    priorMastery,
    evidenceStrength: evidence.length,
    isMastered: posteriorMean >= 0.8 && evidence.length >= 3,
  };
}

// ============================================
// Learning Science Report
// ============================================

export function generateLearningScienceReport(
  studentId: string,
  srsStates: SpacedRepetitionState[],
  retrievalItems: RetrievalItem[],
  calibrationGap: number,
  masteryEstimates: ConfidenceWeightedMastery[],
): LearningScienceReport {
  const avgRetention = srsStates.length > 0
    ? srsStates.reduce((s, st) => s + calculateReviewStrength(st.repetitions, st.quality, 0), 0) / srsStates.length : 0;

  const strong = retrievalItems.filter(i => i.retrievalStrength > 0.7).length;
  const moderate = retrievalItems.filter(i => i.retrievalStrength >= 0.3 && i.retrievalStrength <= 0.7).length;
  const weak = retrievalItems.filter(i => i.retrievalStrength < 0.3).length;

  const mastered = masteryEstimates.filter(m => m.isMastered).length;
  const learning = masteryEstimates.filter(m => !m.isMastered && m.evidenceStrength >= 3).length;
  const unknown = masteryEstimates.filter(m => m.evidenceStrength < 3).length;

  const recommendations: string[] = [];
  const recommendationsZh: string[] = [];

  if (srsStates.filter(s => isDueForReview(s)).length > 5) {
    recommendations.push(`${srsStates.filter(s => isDueForReview(s)).length} items are due for spaced repetition review`);
    recommendationsZh.push(`${srsStates.filter(s => isDueForReview(s)).length} 個項目需要間隔重複複習`);
  }
  if (calibrationGap > 0.15) {
    recommendations.push('Student is overconfident — consider metacognition training');
    recommendationsZh.push('學生過度自信 — 建議進行後設認知訓練');
  }
  if (weak > strong) {
    recommendations.push('Prioritize retrieval practice for weak items before introducing new content');
    recommendationsZh.push('優先提取練習弱項，再引入新內容');
  }

  return {
    studentId, generatedAt: new Date().toISOString(),
    forgettingCurve: { itemsOverTime: generateForgettingCurve(avgRetention || 1), averageRetention: Math.round(avgRetention * 100) / 100 },
    retrievalStrength: { strong, moderate, weak },
    interleavingReadiness: Math.min(1, strong / Math.max(retrievalItems.length, 1) + 0.2),
    desirableDifficultyAlignment: Math.abs(0.75 - (retrievalItems.length > 0 ? strong / retrievalItems.length : 0.5)) < 0.2 ? 0.9 : 0.5,
    metacognitionAccuracy: Math.round((1 - Math.abs(calibrationGap)) * 100) / 100,
    masteryConfidence: { mastered, learning, unknown },
    recommendations, recommendationsZh,
  };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
