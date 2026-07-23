// Sprint 33: DifficultyAdjuster — Desirable Difficulty + Adaptive Leveling
import { calculateDesirableDifficulty } from './learning-science';
import type { ReviewScheduleEntry, DifficultyLevel, DifficultyDirection } from '../types';

// ============================================
// DifficultyAdjuster — optimal challenge point
// ============================================

export class DifficultyAdjuster {
  private readonly TARGET_ACCURACY_MIN = 0.70;
  private readonly TARGET_ACCURACY_MAX = 0.85;

  /** Adjust difficulty based on recent performance */
  adjust(
    entry: ReviewScheduleEntry,
    recentAccuracy: number,
    overallAccuracy: number,
  ): { difficulty: DifficultyLevel; direction: DifficultyDirection; factor: number } {
    const config = calculateDesirableDifficulty(overallAccuracy, recentAccuracy);

    let difficulty: DifficultyLevel;
    if (config.suggestedDifficulty === 'challenge') difficulty = 'challenge';
    else if (config.suggestedDifficulty === 'core') difficulty = 'core';
    else difficulty = 'remedial';

    return {
      difficulty,
      direction: config.adjustment as DifficultyDirection,
      factor: config.adaptiveFactor,
    };
  }

  /** Check if an item is in the optimal difficulty zone */
  isOptimalDifficulty(accuracy: number): boolean {
    return accuracy >= this.TARGET_ACCURACY_MIN && accuracy <= this.TARGET_ACCURACY_MAX;
  }

  /** Calculate the optimal difficulty for a set of entries */
  calculateOptimalLevel(entries: ReviewScheduleEntry[]): DifficultyLevel {
    if (entries.length === 0) return 'core';
    const avgAccuracy = entries.reduce((s, e) => {
      const total = e.timesCorrect + e.timesIncorrect;
      return s + (total > 0 ? e.timesCorrect / total : 0.5);
    }, 0) / entries.length;

    if (avgAccuracy > 0.85) return 'challenge';
    if (avgAccuracy < 0.55) return 'remedial';
    return 'core';
  }

  /** Get the ZPD (Zone of Proximal Development) for a student */
  getZPD(entries: ReviewScheduleEntry[]): {
    remedial: number;
    core: number;
    challenge: number;
    recommended: DifficultyLevel;
  } {
    const byDifficulty = { remedial: 0, core: 0, challenge: 0 };
    const byAccuracy = { remedial: 0, core: 0, challenge: 0 };

    for (const e of entries) {
      const total = e.timesCorrect + e.timesIncorrect;
      const acc = total > 0 ? e.timesCorrect / total : 0;
      byDifficulty[e.currentDifficulty]++;
      byAccuracy[e.currentDifficulty] += acc;
    }

    const avgRemedial = byDifficulty.remedial > 0 ? byAccuracy.remedial / byDifficulty.remedial : 0;
    const avgCore = byDifficulty.core > 0 ? byAccuracy.core / byDifficulty.core : 0;
    const avgChallenge = byDifficulty.challenge > 0 ? byAccuracy.challenge / byDifficulty.challenge : 0;

    // Recommend level up if core accuracy > 80%
    const recommended: DifficultyLevel = avgCore > 0.80 ? 'challenge'
      : avgCore < 0.50 ? 'remedial'
      : 'core';

    return {
      remedial: Math.round(avgRemedial * 100) / 100,
      core: Math.round(avgCore * 100) / 100,
      challenge: Math.round(avgChallenge * 100) / 100,
      recommended,
    };
  }

  /** Apply difficulty adjustment to multiple entries */
  applyAdjustments(entries: ReviewScheduleEntry[]): ReviewScheduleEntry[] {
    return entries.map(e => {
      const total = e.timesCorrect + e.timesIncorrect;
      const accuracy = total > 0 ? e.timesCorrect / total : 0.5;
      const { difficulty, direction, factor } = this.adjust(e, accuracy, accuracy);
      return {
        ...e,
        currentDifficulty: difficulty,
        difficultyAdjustment: direction,
        adaptiveFactor: factor,
      };
    });
  }
}

export const difficultyAdjuster = new DifficultyAdjuster();
