// Sprint 36: MemoryEngine — orchestrates full memory lifecycle
import { memoryService, createEmptyMemory } from './memory-service';
import { memoryRepo } from '../repositories/memory-repository';
import { generateLearningContext, decayScore } from './memory-scoring';
import { MemoryProfileGenerator } from './memory-profile';
import { MemoryInfluenceEngine } from './memory-influence';
import type {
  LearningMemory, LearningMemoryV2, LearningContext,
  ConfidenceMemory, MotivationMemory, LearningHabitsMemory,
  MemoryProfile, MemoryInfluence, DecayResult, RefreshResult,
} from '../types';
import type { SkillDimension } from '@/modules/profile/types';

// ============================================
// MemoryEngine
// ============================================

export class MemoryEngine {
  private profileGen = new MemoryProfileGenerator();
  private influenceEngine = new MemoryInfluenceEngine();

  /** Get or initialize memory for a student */
  async get(studentId: string): Promise<LearningMemoryV2> {
    let memory = memoryRepo.get(studentId);
    if (!memory) {
      try {
        const { loadMemoryFromDb } = await import('../repositories/memory-db-repository');
        const db = await loadMemoryFromDb(studentId);
        if (db) {
          memory = db as LearningMemoryV2;
          memoryRepo.save(studentId, memory);
        }
      } catch { /* DB unavailable */ }
    }
    if (!memory) {
      memory = this.initializeV2(createEmptyMemory(studentId));
      memoryRepo.save(studentId, memory);
      try {
        const { persistMemoryToDb } = await import('../repositories/memory-db-repository');
        await persistMemoryToDb(studentId, memory);
      } catch { /* DB unavailable */ }
    }
    return this.ensureV2(memory);
  }

  /** Update memory with new learning data */
  async update(studentId: string, updates: {
    grammarTopics?: Array<{ topic: string; topicZh: string; correct: boolean; }>;
    newWords?: Array<{ word: string; }>;
    writingSample?: { wordCount: number; textType: string; };
    sessionData?: { duration: number; questionsAnswered: number; correct: number; timeOfDay: string; };
    mistakes?: Array<{ question: string; studentAnswer: string; correctAnswer: string; category: string; }>;
    reviewCompleted?: Array<{ itemId: string; itemType: string; quality: number; }>;
    topicEngagement?: Array<{ topic: string; topicZh: string; accuracy: number; }>;
    selfAssessment?: { confidence: number; actualScore: number; };
  }): Promise<LearningMemoryV2> {
    const memory = await this.get(studentId);

    // Update grammar
    if (updates.grammarTopics) {
      for (const t of updates.grammarTopics) {
        if (t.correct) {
          if (!memory.grammar.masteredTopics.includes(t.topic)) {
            memory.grammar.masteredTopics.push(t.topic);
          }
        } else {
          const existing = memory.grammar.strugglingTopics.find(s => s.topic === t.topic);
          if (existing) {
            existing.errorRate = (existing.errorRate * 0.7 + 1 * 0.3);
            existing.lastPracticed = new Date().toISOString();
          } else {
            memory.grammar.strugglingTopics.push({
              topic: t.topic, topicZh: t.topicZh, errorRate: 1, lastPracticed: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Update vocabulary
    if (updates.newWords) {
      memory.vocabulary.knownWords += updates.newWords.length;
      memory.vocabulary.activeWords += updates.newWords.length;
      for (const w of updates.newWords) {
        memory.vocabulary.recentlyLearned.push({
          word: w.word, addedAt: new Date().toISOString(), masteryStars: 1,
        });
      }
      if (memory.vocabulary.recentlyLearned.length > 50) {
        memory.vocabulary.recentlyLearned = memory.vocabulary.recentlyLearned.slice(-50);
      }
    }

    // Update writing
    if (updates.writingSample) {
      memory.writingStyle.averageEssayLength =
        (memory.writingStyle.averageEssayLength * 0.8 + updates.writingSample.wordCount * 0.2);
      if (!memory.writingStyle.preferredTextTypes.includes(updates.writingSample.textType)) {
        memory.writingStyle.preferredTextTypes.push(updates.writingSample.textType);
      }
    }

    // Update learning speed
    if (updates.sessionData) {
      const s = updates.sessionData;
      memory.learningSpeed.questionsPerDay =
        Math.round((memory.learningSpeed.questionsPerDay * 0.7 + s.questionsAnswered * 0.3) * 10) / 10;
      memory.learningSpeed.averageSessionDuration =
        Math.round((memory.learningSpeed.averageSessionDuration * 0.7 + s.duration * 0.3) * 10) / 10;
      memory.learningSpeed.completionRate =
        Math.round((memory.learningSpeed.completionRate * 0.7 + (s.correct / Math.max(1, s.questionsAnswered)) * 0.3) * 100) / 100;
      memory.learningSpeed.sessionsPerWeek = Math.round(memory.learningSpeed.sessionsPerWeek * 0.8 + 1 * 0.2);

      // Habits
      const hour = parseInt(s.timeOfDay?.split(':')[0] || '14');
      memory.learningHabits.preferredStudyTime =
        hour < 10 ? 'morning' : hour < 14 ? 'afternoon' : hour < 19 ? 'evening' : 'night';
      memory.learningHabits.averageSessionLength =
        Math.round((memory.learningHabits.averageSessionLength * 0.7 + s.duration * 0.3));
    }

    // Update recent errors
    if (updates.mistakes) {
      for (const m of updates.mistakes) {
        memory.recentErrors.last10Errors.unshift({
          question: m.question, studentAnswer: m.studentAnswer,
          correctAnswer: m.correctAnswer, category: m.category,
          timestamp: new Date().toISOString(),
        });
      }
      if (memory.recentErrors.last10Errors.length > 10) {
        memory.recentErrors.last10Errors = memory.recentErrors.last10Errors.slice(0, 10);
      }
      memory.recentErrors.mostRecentErrorCategory = updates.mistakes[0]?.category || '';
      for (const m of updates.mistakes) {
        memory.recentErrors.errorFrequency[m.category] = (memory.recentErrors.errorFrequency[m.category] || 0) + 1;
      }
    }

    // Update review history
    if (updates.reviewCompleted) {
      memory.reviewHistory.totalReviews += updates.reviewCompleted.length;
      memory.reviewHistory.reviewsThisWeek += updates.reviewCompleted.length;
      const avgQ = updates.reviewCompleted.reduce((s, r) => s + r.quality, 0) / updates.reviewCompleted.length;
      memory.reviewHistory.averageReviewScore =
        Math.round(((memory.reviewHistory.averageReviewScore * 0.8 + avgQ * 0.2)) * 10) / 10;
    }

    // Update topic engagement
    if (updates.topicEngagement) {
      for (const t of updates.topicEngagement) {
        const existing = memory.preferredTopics.topTopics.find(pt => pt.topic === t.topic);
        if (existing) {
          existing.engagementScore = (existing.engagementScore * 0.7 + 1 * 0.3);
          existing.accuracy = (existing.accuracy * 0.7 + t.accuracy * 0.3);
        } else {
          memory.preferredTopics.topTopics.push({
            topic: t.topic, topicZh: t.topicZh, engagementScore: 1, accuracy: t.accuracy,
          });
        }
      }
    }

    // Update confidence
    if (updates.selfAssessment) {
      const gap = Math.abs(updates.selfAssessment.confidence - updates.selfAssessment.actualScore);
      memory.confidence.overallConfidence =
        Math.round((memory.confidence.overallConfidence * 0.7 + updates.selfAssessment.confidence * 0.3) * 100) / 100;
      memory.confidence.calibrationAccuracy =
        Math.round((1 - gap) * 100) / 100;
      if (gap > 0.3) memory.confidence.overconfidentTopics.push('recent-session');
    }

    // Update motivation
    memory.motivation.engagementScore =
      Math.round(Math.min(1, memory.motivation.engagementScore + 0.01) * 100) / 100;

    memory.updatedAt = new Date();
    memory.version++;

    memoryRepo.save(studentId, memory);
    try {
      const { persistMemoryToDb } = await import('../repositories/memory-db-repository');
      await persistMemoryToDb(studentId, memory);
    } catch { /* DB unavailable — in-memory only */ }
    return memory;
  }

  /** Apply memory decay — reduces freshness for stale items */
  async applyDecay(studentId: string): Promise<DecayResult> {
    const memory = await this.get(studentId);
    const now = new Date();
    const daysSinceUpdate = (now.getTime() - memory.updatedAt.getTime()) / 86400000;
    const previousFreshness = memory.memoryFreshness;

    // Decay all time-sensitive fields
    const decayFactor = decayScore(daysSinceUpdate, 14); // 14-day half-life

    // Decay vocabulary growth
    memory.vocabulary.vocabularyGrowthRate *= decayFactor;

    // Decay review recency
    memory.reviewHistory.reviewStreak = Math.max(0, memory.reviewHistory.reviewStreak - (daysSinceUpdate > 2 ? 1 : 0));

    // Decay motivation
    memory.motivation.motivationLevel = Math.round(memory.motivation.motivationLevel * decayFactor * 100) / 100;
    memory.motivation.burnoutRisk = Math.round(Math.min(1, memory.motivation.burnoutRisk + (1 - decayFactor) * 0.1) * 100) / 100;

    // Compute new freshness
    const newFreshness = Math.round(decayFactor * 100) / 100;
    memory.memoryFreshness = newFreshness;
    memory.lastDecayApplied = now.toISOString();

    memoryRepo.save(studentId, memory);
    try {
      const { persistMemoryToDb } = await import('../repositories/memory-db-repository');
      await persistMemoryToDb(studentId, memory);
    } catch { /* DB unavailable */ }

    // Count decayed items
    const decayedItems = memory.grammar.strugglingTopics.length +
      memory.vocabulary.recentlyLearned.length +
      memory.recentErrors.last10Errors.length;

    return {
      memoryId: studentId,
      appliedAt: now.toISOString(),
      previousFreshness,
      newFreshness,
      decayedItems,
      archivedItems: 0,
    };
  }

  /** Refresh memory — recompute all derived fields */
  async refresh(studentId: string, newData: {
    recentSessions?: number;
    recentAccuracy?: number;
    masteredTopics?: string[];
    activeSkills?: SkillDimension[];
    weakSkills?: SkillDimension[];
  }): Promise<RefreshResult> {
    const memory = await this.get(studentId);
    const refreshedItems: string[] = [];

    if (newData.masteredTopics) {
      for (const t of newData.masteredTopics) {
        if (!memory.grammar.masteredTopics.includes(t)) {
          memory.grammar.masteredTopics.push(t);
          refreshedItems.push(t);
        }
      }
      // Remove from struggling if now mastered
      memory.grammar.strugglingTopics = memory.grammar.strugglingTopics.filter(
        s => !newData.masteredTopics?.includes(s.topic),
      );
    }

    if (newData.activeSkills) {
      memory.strengths.strongestSkills = newData.activeSkills;
    }

    if (newData.weakSkills) {
      memory.weaknesses.weakestSkills = newData.weakSkills;
    }

    // Refresh motivation
    memory.motivation.motivationLevel = Math.min(1, memory.motivation.motivationLevel + 0.05);
    memory.motivation.engagementScore = Math.min(1, memory.motivation.engagementScore + 0.02);
    memory.motivation.burnoutRisk = Math.max(0, memory.motivation.burnoutRisk - 0.03);
    memory.motivation.motivationTrend =
      memory.motivation.motivationLevel > 0.7 ? 'improving' :
      memory.motivation.motivationLevel > 0.4 ? 'stable' : 'declining';

    // Refresh freshness
    memory.memoryFreshness = Math.min(1, memory.memoryFreshness + 0.2);

    memory.updatedAt = new Date();
    memory.version++;

    memoryRepo.save(studentId, memory);
    try {
      const { persistMemoryToDb } = await import('../repositories/memory-db-repository');
      await persistMemoryToDb(studentId, memory);
    } catch { /* DB unavailable */ }

    return {
      memoryId: studentId,
      refreshedAt: new Date().toISOString(),
      itemsRefreshed: refreshedItems.length,
      newTopicsDetected: refreshedItems.length,
      resolvedWeaknesses: 0,
      updatedSkills: newData.activeSkills || [],
    };
  }

  /** Generate a comprehensive memory profile */
  async getProfile(studentId: string): Promise<MemoryProfile> {
    const memory = await this.get(studentId);
    return this.profileGen.generate(memory);
  }

  /** Get how memory should influence AI systems */
  async getInfluence(studentId: string): Promise<MemoryInfluence> {
    const memory = await this.get(studentId);
    return this.influenceEngine.compute(memory);
  }

  /** Get learning context for prompt injection */
  async getContext(
    studentId: string,
    opts?: { recentAccuracy?: number; recentStreak?: number; recentQuestions?: number; },
  ): Promise<LearningContext> {
    const memory = await this.get(studentId);
    return generateLearningContext(
      memory,
      opts?.recentAccuracy ?? 0.7,
      opts?.recentStreak ?? memory.learningSpeed.streakRecord,
      opts?.recentQuestions ?? memory.learningSpeed.questionsPerDay,
    );
  }

  // ============================================
  // Helpers
  // ============================================

  private initializeV2(memory: LearningMemory): LearningMemoryV2 {
    return {
      ...memory,
      confidence: this.emptyConfidence(),
      motivation: this.emptyMotivation(),
      learningHabits: this.emptyHabits(),
      lastDecayApplied: new Date().toISOString(),
      memoryFreshness: 1.0,
    };
  }

  private ensureV2(memory: LearningMemory | LearningMemoryV2): LearningMemoryV2 {
    if ('confidence' in memory && 'motivation' in memory && 'learningHabits' in memory) {
      return memory as LearningMemoryV2;
    }
    return this.initializeV2(memory);
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

export const memoryEngine = new MemoryEngine();
