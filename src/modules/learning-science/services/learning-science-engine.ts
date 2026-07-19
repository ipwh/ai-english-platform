// Sprint 33: LearningScienceEngine — intelligence layer orchestrator
//
// Integrates: ReviewScheduler, DifficultyAdjuster, ConfidenceEstimator,
//             LearningEffectivenessAnalyzer, ReflectionGenerator
// Builds on:  Existing learning-science algorithms (SM-2, Ebbinghaus, etc.)
// Feeds into: RecommendationEngine, KnowledgeGraph, LearningMemory
//
import { reviewScheduler } from './review-scheduler';
import { difficultyAdjuster } from './difficulty-adjuster';
import { confidenceEstimator } from './confidence-estimator';
import { learningEffectivenessAnalyzer } from './effectiveness-analyzer';
import { reflectionGenerator } from './reflection-generator';
import { learningScienceRepo } from '../repositories/learning-science-repository';
import {
  generateInterleavingPlan,
  scheduleRetrievalPractice,
  generateForgettingCurve,
  generateLearningScienceReport,
} from './learning-science';
import type {
  ReviewScheduleEntry,
  LearningSessionInput,
  LearningSessionOutput,
  EffectivenessReport,
  ItemType,
  LearningStrategy,
} from '../types';

// ============================================
// LearningScienceEngine
// ============================================

export class LearningScienceEngine {

  /**
   * Process a complete learning session:
   * 1. Create/update schedule entries for each item
   * 2. Apply SM-2 + Ebbinghaus for review scheduling
   * 3. Update Bayesian mastery estimates
   * 4. Adjust difficulty based on performance
   * 5. Generate reflection prompts
   * 6. Persist everything to DB
   */
  async processSession(input: LearningSessionInput): Promise<LearningSessionOutput> {
    const sessionId = `ls_${Date.now()}`;
    const now = new Date().toISOString();

    // Load existing entries
    const existingEntries = await learningScienceRepo.getByStudentId(input.studentId);
    const existingMap = new Map(existingEntries.map(e => [e.itemId, e]));

    const processedItems: ReviewScheduleEntry[] = [];
    const difficultyRecs: LearningSessionOutput['difficultyRecommendations'] = [];
    let totalCorrect = 0, totalIncorrect = 0, totalQuality = 0;
    const newMasteries: string[] = [];

    for (const item of input.items) {
      // Get or create entry
      let entry = existingMap.get(item.itemId);
      const fromDifficulty = entry?.currentDifficulty || 'core';

      if (!entry) {
        entry = reviewScheduler.createEntry(
          input.studentId, item.itemId, item.itemType,
          { skillDimension: item.skillDimension, title: item.title, titleZh: item.titleZh },
        );
      }

      // Apply SM-2 scheduling
      entry = reviewScheduler.processReview(entry, item.quality, item.correct);

      // Update Bayesian mastery
      const difficultyNum = item.difficulty === 'challenge' ? 4 : item.difficulty === 'core' ? 3 : 2;
      const masteryUpdate = confidenceEstimator.updateMastery(entry, item.correct, difficultyNum);
      entry = { ...entry, ...masteryUpdate };

      // Adjust difficulty
      const totalAttempts = entry.timesCorrect + entry.timesIncorrect;
      const accuracy = totalAttempts > 0 ? entry.timesCorrect / totalAttempts : 0;
      const adj = difficultyAdjuster.adjust(entry, accuracy, accuracy);
      const toDifficulty = adj.difficulty;

      entry = {
        ...entry,
        currentDifficulty: adj.difficulty,
        difficultyAdjustment: adj.direction,
        adaptiveFactor: adj.factor,
      };

      // Track difficulty changes
      if (fromDifficulty !== toDifficulty) {
        difficultyRecs.push({
          itemId: item.itemId,
          from: fromDifficulty,
          to: toDifficulty,
          reason: toDifficulty === 'challenge'
            ? 'Accuracy high — increasing difficulty'
            : toDifficulty === 'remedial'
              ? 'Accuracy low — decreasing difficulty'
              : 'Maintaining optimal difficulty',
        });
      }

      // Track new masteries
      if (entry.isMastered && !existingMap.get(item.itemId)?.isMastered) {
        newMasteries.push(item.itemId);
      }

      // Persist
      entry = await learningScienceRepo.upsert(entry);

      if (item.correct) totalCorrect++;
      else totalIncorrect++;
      totalQuality += item.quality;
      processedItems.push(entry);
    }

    // Generate reflections
    const reflections = reflectionGenerator.beforePractice(processedItems, 2);

    // Build summary
    const dueEntries = reviewScheduler.getDueEntries(processedItems);
    const urgentCount = dueEntries.filter(e => e.reviewUrgency === 'critical').length;

    return {
      studentId: input.studentId,
      sessionId,
      generatedAt: now,
      items: processedItems,
      summary: {
        totalItems: input.items.length,
        correctCount: totalCorrect,
        incorrectCount: totalIncorrect,
        averageQuality: input.items.length > 0 ? Math.round(totalQuality / input.items.length * 10) / 10 : 0,
        averageRetention: processedItems.length > 0
          ? Math.round(processedItems.reduce((s, e) => s + e.retentionProbability, 0) / processedItems.length * 1000) / 1000
          : 0,
        masteredCount: processedItems.filter(e => e.isMastered).length,
        newMasteries,
        dueForReview: dueEntries.length,
        urgentCount,
      },
      difficultyRecommendations: difficultyRecs,
      reflectionPrompts: reflections,
      nextSessionRecommendation: this.buildNextSessionRecommendation(processedItems),
    };
  }

  /**
   * Get all items due for review, prioritized.
   * Integrates with RecommendationEngine via recommendedStrategy field.
   */
  async getReviewQueue(studentId: string, limit = 20): Promise<ReviewScheduleEntry[]> {
    const allEntries = await learningScienceRepo.getByStudentId(studentId);
    const due = reviewScheduler.getDueEntries(allEntries, limit);

    // Tag each entry with the recommended learning strategy
    return due.map(e => ({
      ...e,
      recommendedStrategy: this.selectStrategy(e),
    }));
  }

  /**
   * Generate an interleaving plan for a set of items
   */
  async generateInterleavingSession(
    studentId: string,
    itemType: ItemType,
  ): Promise<{ plan: ReturnType<typeof generateInterleavingPlan>; entries: ReviewScheduleEntry[] }> {
    const entries = await learningScienceRepo.getByItemType(studentId, itemType);
    const due = reviewScheduler.getDueEntries(entries, 30);

    const topics = [...new Set(due.map(e => e.skillDimension || e.title || e.itemId))];
    const itemsPerTopic: Record<string, number> = {};
    for (const e of due) {
      const key = e.skillDimension || e.title || e.itemId;
      itemsPerTopic[key] = (itemsPerTopic[key] || 0) + 1;
    }

    const plan = generateInterleavingPlan(topics, itemsPerTopic);
    return { plan, entries: due };
  }

  /**
   * Analyze learning effectiveness over a period
   */
  async analyzeEffectiveness(
    studentId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<EffectivenessReport> {
    const entries = await learningScienceRepo.getByStudentId(studentId);
    return learningEffectivenessAnalyzer.analyze(studentId, entries, periodStart, periodEnd);
  }

  /**
   * Generate a comprehensive report (builds on existing LearningScienceReport)
   */
  async generateReport(studentId: string): Promise<{
    science: ReturnType<typeof generateLearningScienceReport>;
    effectiveness: EffectivenessReport;
    zpd: ReturnType<typeof difficultyAdjuster.getZPD>;
    masteryDistribution: ReturnType<typeof confidenceEstimator.getMasteryDistribution>;
  }> {
    const entries = await learningScienceRepo.getByStudentId(studentId);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const now = new Date().toISOString();

    // Build report from entries
    const srsStates = entries.map(e => ({
      itemId: e.itemId, interval: e.interval, easeFactor: e.easeFactor,
      repetitions: e.repetitions, lastReviewedAt: e.lastReviewedAt || now,
      nextReviewAt: e.nextReviewAt, quality: e.quality, lapses: e.lapses,
    }));
    const retrievalItems = entries.map(e => ({
      itemId: e.itemId, question: e.title || e.itemId, answer: '',
      timesCorrect: e.timesCorrect, timesIncorrect: e.timesIncorrect,
      retrievalStrength: e.retrievalStrength,
    }));
    const masteryEstimates = entries.map(e => ({
      itemId: e.itemId, estimatedMastery: e.estimatedMastery,
      confidence: e.masteryConfidence, lastUpdated: now,
      priorMastery: 0.5, evidenceStrength: e.evidenceCount,
      isMastered: e.isMastered,
    }));

    const effectiveness = learningEffectivenessAnalyzer.analyze(studentId, entries, thirtyDaysAgo, now);
    const zpd = difficultyAdjuster.getZPD(entries);
    const masteryDistribution = confidenceEstimator.getMasteryDistribution(entries);

    const science = generateLearningScienceReport(
      studentId, srsStates, retrievalItems,
      Math.round(effectiveness.metrics.averageCalibration * 100) / 100,
      masteryEstimates,
    );

    return { science, effectiveness, zpd, masteryDistribution };
  }

  /**
   * Get mastery stats for integration with RecommendationEngine
   */
  async getMasteryForRecommendation(studentId: string): Promise<Array<{
    nodeId: string;
    skill: string;
    currentMastery: number;
    isMastered: boolean;
    reviewPriority: number;
    recommendedStrategy?: LearningStrategy;
  }>> {
    const entries = await learningScienceRepo.getByStudentId(studentId);
    return entries.map(e => ({
      nodeId: e.itemId,
      skill: e.skillDimension || e.itemType,
      currentMastery: e.estimatedMastery,
      isMastered: e.isMastered,
      reviewPriority: e.reviewPriority,
      recommendedStrategy: this.selectStrategy(e),
    }));
  }

  // ============================================
  // Strategy selection
  // ============================================

  private selectStrategy(entry: ReviewScheduleEntry): LearningStrategy {
    if (entry.retrievalStrength < 0.3) return 'active-recall';
    if (entry.lapses >= 2) return 'spaced-repetition';
    if (entry.masteryConfidence < 0.5) return 'confidence-based';
    if (entry.isMastered && entry.retrievalStrength < 0.6) return 'retrieval-practice';
    if (entry.difficultyAdjustment !== 'maintain') return 'desirable-difficulty';
    if (!entry.lastReflection) return 'reflection';
    return 'spaced-repetition';
  }

  private buildNextSessionRecommendation(entries: ReviewScheduleEntry[]): string {
    const due = entries.filter(e => !e.isMastered && new Date(e.nextReviewAt) <= new Date());
    const needsReflection = entries.filter(e => !e.lastReflection).length;

    if (due.length > 10) return `You have ${due.length} items due for review. Prioritize critical items first.`;
    if (needsReflection > 3) return `${needsReflection} items would benefit from self-reflection.`;
    if (entries.filter(e => e.reviewUrgency === 'critical').length > 0) {
      return 'You have critical items needing immediate review. Focus on these first.';
    }
    return 'Good progress! Consider interleaving practice to strengthen retention.';
  }
}

// Singleton
export const learningScienceEngine = new LearningScienceEngine();
