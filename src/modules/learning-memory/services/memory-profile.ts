// Sprint 36: MemoryProfile — comprehensive student profile from memory
import type {
  LearningMemoryV2, MemoryProfile, ConfidenceMemory, MotivationMemory, LearningHabitsMemory,
} from '../types';

// ============================================
// MemoryProfileGenerator
// ============================================

export class MemoryProfileGenerator {

  /** Generate a comprehensive memory-derived profile */
  generate(memory: LearningMemoryV2): MemoryProfile {
    const now = new Date().toISOString();

    // Overall metrics
    const memoryFreshness = memory.memoryFreshness ?? 1.0;
    const totalKnowledgePoints = memory.grammar.masteredTopics.length * 10
      + memory.vocabulary.knownWords * 0.5
      + memory.strengths.strongestSkills.length * 5;
    const masteryPercentage = memory.grammar.masteredTopics.length > 0
      ? memory.grammar.masteredTopics.length / Math.max(1, memory.grammar.masteredTopics.length + memory.grammar.strugglingTopics.length)
      : 0;
    const learningVelocity = memory.vocabulary.vocabularyGrowthRate * 7; // words/week
    const reviewCompliance = memory.reviewHistory.totalReviews > 0
      ? 1 - memory.reviewHistory.overdueReviews / Math.max(1, memory.reviewHistory.totalReviews)
      : 0;

    // Skill profiles
    const skillProfiles: MemoryProfile['skillProfiles'] = {};
    const allSkills = new Set([
      ...memory.strengths.strongestSkills,
      ...memory.weaknesses.weakestSkills,
      ...Object.keys(memory.confidence?.confidenceBySkill || {}),
    ]);

    for (const skill of [...allSkills]) {
      const isStrength = memory.strengths.strongestSkills.includes(skill as 'grammar' | 'vocabulary' | 'writing' | 'reading' | 'speaking' | 'listening');
      const isWeakness = memory.weaknesses.weakestSkills.includes(skill as 'grammar' | 'vocabulary' | 'writing' | 'reading' | 'speaking' | 'listening');
      const confidence = memory.confidence?.confidenceBySkill?.[skill] ?? 0.5;

      skillProfiles[skill] = {
        level: isStrength ? 'B2' : isWeakness ? 'A2' : 'B1',
        confidence,
        strengthCount: isStrength ? 1 : 0,
        weaknessCount: isWeakness ? 1 : 0,
        recommendedAction: isWeakness
          ? `Focus on ${skill} with targeted practice`
          : isStrength
            ? `Challenge yourself with advanced ${skill} exercises`
            : `Maintain current ${skill} level`,
      };
    }

    // Top strengths
    const topStrengths = memory.strengths.topPerformingTopics
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 5)
      .map(s => s.topic);

    // Critical weaknesses
    const criticalWeaknesses = memory.weaknesses.persistentWeaknesses
      .filter(w => w.severity === 'critical' || w.duration > 30)
      .slice(0, 5)
      .map(w => w.topic);

    // Next milestones
    const nextMilestones = [
      `Reach ${memory.vocabulary.knownWords + 50} known words (currently ${memory.vocabulary.knownWords})`,
      `Improve ${memory.grammar.strugglingTopics[0]?.topic || 'grammar'} accuracy above 80%`,
      `Complete ${memory.learningSpeed.sessionsPerWeek + 1} sessions this week`,
    ];
    const nextMilestonesZh = [
      `達到 ${memory.vocabulary.knownWords + 50} 個已知詞彙（目前 ${memory.vocabulary.knownWords}）`,
      `將 ${memory.grammar.strugglingTopics[0]?.topicZh || '文法'} 正確率提升至 80% 以上`,
      `本週完成 ${memory.learningSpeed.sessionsPerWeek + 1} 次練習`,
    ];

    return {
      studentId: memory.studentId,
      generatedAt: now,
      overallMetrics: {
        memoryFreshness: Math.round(memoryFreshness * 100) / 100,
        totalKnowledgePoints: Math.round(totalKnowledgePoints),
        masteryPercentage: Math.round(masteryPercentage * 100) / 100,
        learningVelocity: Math.round(learningVelocity * 10) / 10,
        reviewCompliance: Math.round(reviewCompliance * 100) / 100,
      },
      skillProfiles,
      confidence: memory.confidence || this.emptyConfidence(),
      motivation: memory.motivation || this.emptyMotivation(),
      learningHabits: memory.learningHabits || this.emptyHabits(),
      topStrengths,
      criticalWeaknesses,
      nextMilestones,
      nextMilestonesZh,
    };
  }

  private emptyConfidence(): ConfidenceMemory {
    return { overallConfidence: 0.5, confidenceBySkill: {}, calibrationAccuracy: 0, overconfidentTopics: [], underconfidentTopics: [], confidenceTrend: 'stable' };
  }
  private emptyMotivation(): MotivationMemory {
    return { motivationLevel: 0.5, intrinsicMotivation: 0.5, extrinsicMotivation: 0.5, motivationTrend: 'stable', burnoutRisk: 0, engagementScore: 0.5, recentAchievements: [], demotivationTriggers: [] };
  }
  private emptyHabits(): LearningHabitsMemory {
    return { preferredStudyTime: 'afternoon', averageSessionLength: 15, sessionsPerWeek: 2, weekendWarrior: false, distractionPatterns: [], focusLevel: 0.5, noteTakingStyle: 'moderate', reviewConsistency: 0.5, procrastinationIndex: 0.5 };
  }
}

export const memoryProfileGenerator = new MemoryProfileGenerator();
