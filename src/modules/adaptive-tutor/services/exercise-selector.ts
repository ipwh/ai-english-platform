// Sprint 35: ExerciseSelector — picks optimal exercise format & difficulty
import type {
  PersonalizationContext, ExerciseSpec, ExerciseFormat, AdaptiveDifficulty,
} from '../types';
import type { SkillDimension } from '@/modules/profile/types';
import { difficultyAdjuster } from '@/modules/learning-science/services/difficulty-adjuster';
import type { ReviewScheduleEntry } from '@/modules/learning-science/types';
import { weaknessLocator } from '@/modules/knowledge-graph/services/weakness-locator';

// ============================================
// ExerciseSelector
// ============================================

export class ExerciseSelector {

  /** Select the optimal exercise for the current context */
  select(ctx: PersonalizationContext): ExerciseSpec {
    const { masteryScores, recentSessions, preferredTopics, gradeLevel, availableTimeMinutes } = ctx;

    // 1. Determine skill focus: use weakest skill
    const weaknesses = weaknessLocator.locate({
      studentId: ctx.studentId,
      masteryScores,
    });

    const skillFocus: SkillDimension = weaknesses.skillBreakdown[0]?.skill as SkillDimension
      || recentSessions[0]?.skillFocus
      || 'grammar';

    // 2. Pick topic node: weakest unmastered node in focus skill
    const weakNodes = weaknesses.weaknesses.filter(w => w.skill === skillFocus);
    const topicNodeId = weakNodes[0]?.nodeId
      || Object.entries(masteryScores)
        .filter(([, m]) => m < 70)
        .sort(([, a], [, b]) => a - b)[0]?.[0]
      || 'tenses-simple';

    // 3. Determine difficulty
    const weakEntries = ctx.reviewSchedule.filter(e => e.skillDimension === skillFocus);
    const avgAccuracy = weakEntries.length > 0
      ? weakEntries.reduce((s, e) => {
        const total = e.timesCorrect + e.timesIncorrect;
        return s + (total > 0 ? e.timesCorrect / total : 0.5);
      }, 0) / weakEntries.length
      : 0.5;

    const difficultyResult = difficultyAdjuster.adjust(
      { currentDifficulty: 'core', timesCorrect: 0, timesIncorrect: 0 } as unknown as ReviewScheduleEntry,
      avgAccuracy, avgAccuracy,
    );

    // 4. Select format based on skill & mood
    const format = this.selectFormat(skillFocus, ctx.mood);

    // 5. Calculate question count based on available time
    const timePerQuestion = format === 'short-writing' ? 5 : format === 'listening-comprehension' ? 3 : 1.5;
    const questionCount = Math.max(1, Math.min(10, Math.floor(availableTimeMinutes / timePerQuestion)));

    return {
      format,
      difficulty: difficultyResult.difficulty as ExerciseSpec['difficulty'],
      topicNodeId,
      questionCount,
      estimatedTime: Math.round(questionCount * timePerQuestion),
      skillFocus,
    };
  }

  /** Select exercise format based on skill and student energy */
  private selectFormat(skill: SkillDimension, mood?: number): ExerciseFormat {
    const isLowEnergy = mood !== undefined && mood <= 2;
    const isHighEnergy = mood !== undefined && mood >= 4;

    switch (skill) {
      case 'grammar':
        return isLowEnergy ? 'mcq' : isHighEnergy ? 'fill-blank' : 'fill-blank';
      case 'vocabulary':
        return isLowEnergy ? 'matching' : 'fill-blank';
      case 'reading':
        return 'mcq';
      case 'writing':
        return isLowEnergy ? 'mcq' : 'short-writing';
      case 'listening':
        return 'listening-comprehension';
      case 'speaking':
        return 'short-writing'; // text-based speaking practice
      default:
        return 'mcq';
    }
  }

  /** Generate a difficulty recommendation with reason */
  getDifficultyRecommendation(ctx: PersonalizationContext): AdaptiveDifficulty {
    const spec = this.select(ctx);
    const targetAccuracy = spec.difficulty === 'challenge' ? 0.75 : spec.difficulty === 'core' ? 0.80 : 0.85;

    return {
      level: spec.difficulty,
      reason: spec.difficulty === 'challenge'
        ? 'Student shows strong accuracy — increasing difficulty to maintain optimal challenge'
        : spec.difficulty === 'remedial'
          ? 'Student is struggling — reducing difficulty to build foundation'
          : 'Maintaining current difficulty level in optimal learning zone',
      reasonZh: spec.difficulty === 'challenge'
        ? '學生表現良好 — 提升難度以保持最佳挑戰'
        : spec.difficulty === 'remedial'
          ? '學生遇到困難 — 降低難度以鞏固基礎'
          : '維持當前難度在最佳學習區間',
      targetAccuracy,
    };
  }
}

export const exerciseSelector = new ExerciseSelector();
