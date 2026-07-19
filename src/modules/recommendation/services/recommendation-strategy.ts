// Sprint 22: Recommendation Strategy — 8 deterministic strategies
import type {
  Recommendation, RecommendationStrategy, StrategyContext, StrategyResult,
  ScoreFactors, RecommendationInput,
} from '../types';
import type { SkillDimension } from '@/modules/profile/types';

// ============================================
// Base helpers
// ============================================

function makeId(prefix: string, studentId: string, nodeId: string): string {
  return `${prefix}_${studentId}_${nodeId}_${Date.now()}`;
}

function defaultFactors(overrides: Partial<ScoreFactors> = {}): ScoreFactors {
  return {
    masteryGap: 0, recency: 0, mistakeFrequency: 0,
    preferenceMatch: 0, pathPosition: 0, prerequisiteReadiness: 1,
    timeFit: 1, streakBonus: 0, srsUrgency: 0,
    ...overrides,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function estimateTimeGain(masteryGap: number, difficulty: number): number {
  // Higher gap + appropriate difficulty = higher potential gain
  return clamp(Math.round(masteryGap * 0.6 + (6 - difficulty) * 5), 5, 95);
}

// ============================================
// Strategy 1: Weakness Next Exercise
// ============================================

export class WeaknessExerciseStrategy implements RecommendationStrategy {
  name = 'weakness-exercise';
  weight = 10;

  applies(ctx: StrategyContext): boolean {
    return ctx.input.masteryScores.some(m => m.currentMastery < m.masteryThreshold);
  }

  generate(ctx: StrategyContext): StrategyResult {
    const recs: Recommendation[] = [];
    const weak = ctx.input.masteryScores
      .filter(m => m.currentMastery < m.masteryThreshold)
      .sort((a, b) => a.currentMastery - b.currentMastery);

    for (const w of weak.slice(0, 3)) {
      const gap = w.masteryThreshold - w.currentMastery;
      recs.push({
        id: makeId('we', ctx.input.studentId, w.nodeId),
        type: 'next-exercise',
        skill: w.skill,
        nodeId: w.nodeId,
        title: w.title,
        titleZh: w.titleZh,
        reason: '',
        reasonZh: '',
        confidenceScore: clamp(0.5 + gap / 100, 0.5, 0.95),
        estimatedTime: Math.min(w.estimatedLearningTime, ctx.input.availableStudyTime / 3),
        difficulty: w.difficulty,
        expectedLearningGain: estimateTimeGain(gap, w.difficulty),
        priority: gap >= 30 ? 'must-do' : 'should-do',
        cefr: w.cefr,
        strategy: this.name,
        generatedAt: ctx.now,
      });
    }
    return { recommendations: recs, strategy: this.name, confidence: 0.85 };
  }

  explain(r: Recommendation, ctx: StrategyContext): { reason: string; reasonZh: string } {
    const node = ctx.input.masteryScores.find(m => m.nodeId === r.nodeId);
    const gap = node ? node.masteryThreshold - node.currentMastery : 0;
    return {
      reason: `Weak area: mastery at ${node?.currentMastery ?? '?'}% (target ${node?.masteryThreshold ?? 70}%, gap ${gap}%)`,
      reasonZh: `弱項：掌握度 ${node?.currentMastery ?? '?'}%（目標 ${node?.masteryThreshold ?? 70}%，差距 ${gap}%）`,
    };
  }
}

// ============================================
// Strategy 2: Spaced Repetition Review
// ============================================

export class SpacedRepetitionStrategy implements RecommendationStrategy {
  name = 'spaced-repetition';
  weight = 9;

  applies(ctx: StrategyContext): boolean {
    return ctx.input.masteryScores.some(m =>
      m.daysSinceLastPractice > 3 && m.currentMastery < 80
    );
  }

  generate(ctx: StrategyContext): StrategyResult {
    const recs: Recommendation[] = [];
    const due = ctx.input.masteryScores
      .filter(m => m.daysSinceLastPractice > 3 && m.currentMastery < 80)
      .sort((a, b) => b.daysSinceLastPractice - a.daysSinceLastPractice);

    for (const d of due.slice(0, 2)) {
      recs.push({
        id: makeId('sr', ctx.input.studentId, d.nodeId),
        type: 'review-exercise',
        skill: d.skill,
        nodeId: d.nodeId,
        title: `Review: ${d.title}`,
        titleZh: `複習：${d.titleZh}`,
        reason: '',
        reasonZh: '',
        confidenceScore: clamp(0.4 + d.daysSinceLastPractice / 30, 0.4, 0.9),
        estimatedTime: Math.min(d.estimatedLearningTime * 0.5, ctx.input.availableStudyTime / 4),
        difficulty: d.difficulty,
        expectedLearningGain: clamp(Math.round(d.daysSinceLastPractice * 2), 5, 40),
        priority: d.daysSinceLastPractice > 7 ? 'must-do' : 'should-do',
        cefr: d.cefr,
        strategy: this.name,
        generatedAt: ctx.now,
      });
    }
    return { recommendations: recs, strategy: this.name, confidence: 0.75 };
  }

  explain(r: Recommendation, ctx: StrategyContext): { reason: string; reasonZh: string } {
    const node = ctx.input.masteryScores.find(m => m.nodeId === r.nodeId);
    return {
      reason: `Due for review: last practiced ${node?.daysSinceLastPractice ?? '?'} days ago`,
      reasonZh: `到期複習：上次練習在 ${node?.daysSinceLastPractice ?? '?'} 天前`,
    };
  }
}

// ============================================
// Strategy 3: Mistake-Driven Review
// ============================================

export class MistakeReviewStrategy implements RecommendationStrategy {
  name = 'mistake-review';
  weight = 8;

  applies(ctx: StrategyContext): boolean {
    return ctx.input.mistakeStats.totalMistakes > 0 &&
           ctx.input.mistakeStats.pendingReviewCount > 0;
  }

  generate(ctx: StrategyContext): StrategyResult {
    const recs: Recommendation[] = [];
    const { mistakeStats, masteryScores } = ctx.input;

    // Map mistake categories to skill dimensions
    const catToSkill: Record<string, SkillDimension> = {
      grammar: 'grammar', vocabulary: 'vocabulary', comprehension: 'reading',
      careless: 'grammar', 'time-management': 'reading', chinglish: 'writing',
    };

    for (const [cat, count] of Object.entries(mistakeStats.byCategory)) {
      if (count === 0) continue;
      const skill = catToSkill[cat] || 'grammar';
      const candidates = masteryScores.filter(m => m.skill === skill && m.currentMastery < 85);
      if (candidates.length === 0) continue;

      const target = candidates.sort((a, b) => a.currentMastery - b.currentMastery)[0];
      const urgency = Math.min(count / Math.max(mistakeStats.totalMistakes, 1), 1);

      recs.push({
        id: makeId('mr', ctx.input.studentId, target.nodeId),
        type: 'review-exercise',
        skill,
        nodeId: target.nodeId,
        title: `Review ${cat}: ${target.title}`,
        titleZh: `複習${cat}：${target.titleZh}`,
        reason: '',
        reasonZh: '',
        confidenceScore: clamp(0.5 + urgency * 0.4, 0.5, 0.9),
        estimatedTime: Math.min(target.estimatedLearningTime * 0.6, ctx.input.availableStudyTime / 4),
        difficulty: target.difficulty,
        expectedLearningGain: clamp(Math.round(count * 2), 10, 60),
        priority: count >= 3 ? 'must-do' : 'should-do',
        cefr: target.cefr,
        strategy: this.name,
        generatedAt: ctx.now,
      });
    }
    return { recommendations: recs.slice(0, 3), strategy: this.name, confidence: 0.8 };
  }

  explain(r: Recommendation, ctx: StrategyContext): { reason: string; reasonZh: string } {
    return {
      reason: `Based on ${ctx.input.mistakeStats.totalMistakes} recent mistakes — focus on weak areas`,
      reasonZh: `根據 ${ctx.input.mistakeStats.totalMistakes} 個近期錯誤 — 專注弱項`,
    };
  }
}

// ============================================
// Strategy 4: Topic Preference
// ============================================

export class TopicPreferenceStrategy implements RecommendationStrategy {
  name = 'topic-preference';
  weight = 6;

  applies(ctx: StrategyContext): boolean {
    return ctx.input.preferredTopics.length > 0;
  }

  generate(ctx: StrategyContext): StrategyResult {
    const recs: Recommendation[] = [];
    const topTopics = ctx.input.preferredTopics
      .sort((a, b) => b.engagementCount - a.engagementCount)
      .slice(0, 3);

    for (const topic of topTopics) {
      // Find a skill that hasn't been mastered yet, prefer matching skill
      const candidates = ctx.input.masteryScores.filter(m =>
        m.currentMastery < 85 && m.title.toLowerCase().includes(topic.topic.toLowerCase().slice(0, 4))
      );
      const target = candidates.length > 0
        ? candidates.sort((a, b) => a.currentMastery - b.currentMastery)[0]
        : ctx.input.masteryScores.find(m => m.currentMastery < 85);

      if (!target) continue;

      recs.push({
        id: makeId('tp', ctx.input.studentId, target.nodeId),
        type: 'next-exercise',
        skill: target.skill,
        nodeId: target.nodeId,
        title: `${target.title} (${topic.topic})`,
        titleZh: `${target.titleZh}（${topic.topic}）`,
        reason: '',
        reasonZh: '',
        confidenceScore: clamp(0.5 + topic.averageScore / 100, 0.5, 0.8),
        estimatedTime: target.estimatedLearningTime,
        difficulty: target.difficulty,
        expectedLearningGain: clamp(Math.round(topic.averageScore * 0.5), 10, 50),
        priority: 'could-do',
        cefr: target.cefr,
        strategy: this.name,
        generatedAt: ctx.now,
      });
    }
    return { recommendations: recs.slice(0, 2), strategy: this.name, confidence: 0.65 };
  }

  explain(r: Recommendation, ctx: StrategyContext): { reason: string; reasonZh: string } {
    const top = ctx.input.preferredTopics[0];
    return {
      reason: `Based on your interest in "${top?.topic ?? 'various topics'}"`,
      reasonZh: `根據你對「${top?.topic ?? '各類主題'}」的興趣`,
    };
  }
}

// ============================================
// Strategy 5: Learning Path Progression
// ============================================

export class LearningPathStrategy implements RecommendationStrategy {
  name = 'learning-path';
  weight = 7;

  applies(_ctx: StrategyContext): boolean {
    return true; // Always applicable
  }

  generate(ctx: StrategyContext): StrategyResult {
    const recs: Recommendation[] = [];
    // Find nodes where all prerequisites are mastered but node itself is not
    const ready = ctx.input.masteryScores.filter(m => {
      if (m.currentMastery >= m.masteryThreshold) return false;
      // Check if prerequisites are met (simplified: using accuracy as proxy)
      return m.accuracy >= 0.3 || m.totalAttempts >= 3;
    }).sort((a, b) => a.difficulty - b.difficulty || a.currentMastery - b.currentMastery);

    for (const r of ready.slice(0, 3)) {
      recs.push({
        id: makeId('lp', ctx.input.studentId, r.nodeId),
        type: 'next-exercise',
        skill: r.skill,
        nodeId: r.nodeId,
        title: r.title,
        titleZh: r.titleZh,
        reason: '',
        reasonZh: '',
        confidenceScore: 0.7,
        estimatedTime: r.estimatedLearningTime,
        difficulty: r.difficulty,
        expectedLearningGain: clamp(Math.round((r.masteryThreshold - r.currentMastery) * 0.7), 10, 60),
        priority: 'should-do',
        cefr: r.cefr,
        strategy: this.name,
        generatedAt: ctx.now,
      });
    }
    return { recommendations: recs, strategy: this.name, confidence: 0.7 };
  }

  explain(r: Recommendation, _ctx: StrategyContext): { reason: string; reasonZh: string } {
    return {
      reason: `Next step in your learning journey: ${r.title}`,
      reasonZh: `學習旅程的下一步：${r.titleZh}`,
    };
  }
}

// ============================================
// Strategy 6: Vocabulary Review (SRS-based)
// ============================================

export class VocabularyReviewStrategy implements RecommendationStrategy {
  name = 'vocabulary-review';
  weight = 5;

  applies(ctx: StrategyContext): boolean {
    return ctx.input.learningProfile.vocabularyStats.dueForReview > 0;
  }

  generate(ctx: StrategyContext): StrategyResult {
    const { vocabularyStats } = ctx.input.learningProfile;
    const recs: Recommendation[] = [];

    if (vocabularyStats.dueForReview > 0) {
      const vocabNode = ctx.input.masteryScores.find(m => m.skill === 'vocabulary');
      recs.push({
        id: makeId('vr', ctx.input.studentId, vocabNode?.nodeId ?? 'vocab-review'),
        type: 'vocabulary-review',
        skill: 'vocabulary',
        nodeId: vocabNode?.nodeId ?? 'vocab-review',
        title: `Vocabulary Review (${vocabularyStats.dueForReview} words due)`,
        titleZh: `詞彙複習（${vocabularyStats.dueForReview} 個詞彙到期）`,
        reason: '',
        reasonZh: '',
        confidenceScore: clamp(0.5 + vocabularyStats.dueForReview / 50, 0.5, 0.95),
        estimatedTime: Math.min(vocabularyStats.dueForReview * 2, ctx.input.availableStudyTime / 3),
        difficulty: 2,
        expectedLearningGain: clamp(vocabularyStats.dueForReview * 1.5, 10, 50),
        priority: vocabularyStats.dueForReview > 10 ? 'must-do' : 'should-do',
        cefr: 'B1',
        strategy: this.name,
        generatedAt: ctx.now,
      });
    }
    return { recommendations: recs, strategy: this.name, confidence: 0.8 };
  }

  explain(r: Recommendation, ctx: StrategyContext): { reason: string; reasonZh: string } {
    const due = ctx.input.learningProfile.vocabularyStats.dueForReview;
    return {
      reason: `${due} vocabulary items are due for SRS review`,
      reasonZh: `${due} 個詞彙已到期需要 SRS 複習`,
    };
  }
}

// ============================================
// Strategy 7: Skill-Specific (Reading/Writing/Listening/Speaking)
// ============================================

export class SkillSpecificStrategy implements RecommendationStrategy {
  name = 'skill-specific';
  weight = 4;

  applies(ctx: StrategyContext): boolean {
    return !!ctx.input.focusSkill;
  }

  generate(ctx: StrategyContext): StrategyResult {
    const recs: Recommendation[] = [];
    const focus = ctx.input.focusSkill;
    if (!focus) return { recommendations: [], strategy: this.name, confidence: 0 };

    // Find lowest-mastery node for the focused skill
    const candidates = ctx.input.masteryScores
      .filter(m => m.skill === focus && m.currentMastery < 90)
      .sort((a, b) => a.currentMastery - b.currentMastery);

    for (const c of candidates.slice(0, 2)) {
      const typeMap: Record<string, Recommendation['type']> = {
        reading: 'reading-recommendation',
        writing: 'writing-recommendation',
        listening: 'listening-recommendation',
        speaking: 'speaking-recommendation',
        grammar: 'grammar-review',
        vocabulary: 'vocabulary-review',
      };

      recs.push({
        id: makeId('ss', ctx.input.studentId, c.nodeId),
        type: typeMap[focus] || 'next-exercise',
        skill: focus,
        nodeId: c.nodeId,
        title: c.title,
        titleZh: c.titleZh,
        reason: '',
        reasonZh: '',
        confidenceScore: 0.75,
        estimatedTime: c.estimatedLearningTime,
        difficulty: c.difficulty,
        expectedLearningGain: clamp(Math.round((c.masteryThreshold - c.currentMastery) * 0.8), 10, 70),
        priority: 'should-do',
        cefr: c.cefr,
        strategy: this.name,
        generatedAt: ctx.now,
      });
    }
    return { recommendations: recs, strategy: this.name, confidence: 0.75 };
  }

  explain(r: Recommendation, _ctx: StrategyContext): { reason: string; reasonZh: string } {
    return {
      reason: `Focused practice on ${r.skill}: ${r.title}`,
      reasonZh: `專注練習${r.skill}：${r.titleZh}`,
    };
  }
}

// ============================================
// Strategy 8: Streak Maintenance
// ============================================

export class StreakMaintenanceStrategy implements RecommendationStrategy {
  name = 'streak-maintenance';
  weight = 3;

  applies(ctx: StrategyContext): boolean {
    return ctx.input.learningProfile.currentStreak >= 2;
  }

  generate(ctx: StrategyContext): StrategyResult {
    const recs: Recommendation[] = [];
    const { currentStreak, sessionsLast7Days } = ctx.input.learningProfile;
    const needsSession = sessionsLast7Days < 3;

    if (needsSession) {
      // Pick an easy, quick exercise to maintain streak
      const easy = ctx.input.masteryScores
        .filter(m => m.difficulty <= 3 && m.currentMastery < 90)
        .sort((a, b) => a.estimatedLearningTime - b.estimatedLearningTime);

      const target = easy[0];
      if (target) {
        recs.push({
          id: makeId('sm', ctx.input.studentId, target.nodeId),
          type: 'next-exercise',
          skill: target.skill,
          nodeId: target.nodeId,
          title: `Quick ${target.title} (Streak Day ${currentStreak})`,
          titleZh: `快速${target.titleZh}（連續第 ${currentStreak} 天）`,
          reason: '',
          reasonZh: '',
          confidenceScore: 0.6,
          estimatedTime: Math.min(target.estimatedLearningTime * 0.5, 15),
          difficulty: target.difficulty,
          expectedLearningGain: clamp(currentStreak * 2, 5, 30),
          priority: currentStreak >= 5 ? 'must-do' : 'could-do',
          cefr: target.cefr,
          strategy: this.name,
          generatedAt: ctx.now,
        });
      }
    }
    return { recommendations: recs, strategy: this.name, confidence: 0.6 };
  }

  explain(r: Recommendation, ctx: StrategyContext): { reason: string; reasonZh: string } {
    return {
      reason: `Keep your ${ctx.input.learningProfile.currentStreak}-day streak going!`,
      reasonZh: `保持你的 ${ctx.input.learningProfile.currentStreak} 天連續學習記錄！`,
    };
  }
}
