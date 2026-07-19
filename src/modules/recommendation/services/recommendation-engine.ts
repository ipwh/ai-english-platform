// Sprint 22: Recommendation Engine — orchestrates strategies, scoring, reasons
import type {
  RecommendationInput, RecommendationResult, Recommendation,
  RecommendationStrategy, StrategyContext,
} from '../types';
import {
  WeaknessExerciseStrategy, SpacedRepetitionStrategy,
  MistakeReviewStrategy, TopicPreferenceStrategy,
  LearningPathStrategy, VocabularyReviewStrategy,
  SkillSpecificStrategy, StreakMaintenanceStrategy,
} from './recommendation-strategy';
import { scoreAll } from './recommendation-scorer';
import { enrichRecommendations } from './recommendation-reason-generator';

// ============================================
// Strategy Registry (ordered by weight)
// ============================================

const ALL_STRATEGIES: RecommendationStrategy[] = [
  new WeaknessExerciseStrategy(),
  new SpacedRepetitionStrategy(),
  new MistakeReviewStrategy(),
  new LearningPathStrategy(),
  new TopicPreferenceStrategy(),
  new VocabularyReviewStrategy(),
  new SkillSpecificStrategy(),
  new StreakMaintenanceStrategy(),
].sort((a, b) => b.weight - a.weight);

// ============================================
// Main Engine
// ============================================

export class RecommendationEngine {
  private strategies: RecommendationStrategy[];

  constructor(strategies?: RecommendationStrategy[]) {
    this.strategies = strategies || ALL_STRATEGIES;
  }

  /**
   * Generate personalized recommendations.
   * Deterministic — same input always produces same output.
   */
  generate(input: RecommendationInput): RecommendationResult {
    const startTime = Date.now();
    const ctx: StrategyContext = { input, now: new Date() };
    const maxRecs = input.maxRecommendations || 8;

    // Phase 1: Run all applicable strategies
    const allRecommendations: Recommendation[] = [];
    const strategiesUsed: string[] = [];

    for (const strategy of this.strategies) {
      if (!strategy.applies(ctx)) continue;
      strategiesUsed.push(strategy.name);

      const result = strategy.generate(ctx);
      allRecommendations.push(...result.recommendations);
    }

    // Phase 2: Deduplicate by nodeId (keep highest confidence)
    const deduped = this.deduplicate(allRecommendations);

    // Phase 3: Score all recommendations
    const scored = scoreAll(deduped, input);

    // Phase 4: Enrich with human-readable reasons
    const enriched = enrichRecommendations(scored, input);

    // Phase 5: Fit within available study time budget
    const fitted = this.fitBudget(enriched, input.availableStudyTime, maxRecs);

    // Phase 6: Build summary
    const summary = this.buildSummary(fitted);

    return {
      studentId: input.studentId,
      generatedAt: ctx.now,
      availableStudyTime: input.availableStudyTime,
      totalEstimatedTime: fitted.reduce((sum, r) => sum + r.estimatedTime, 0),
      recommendations: fitted,
      summary,
      diagnostics: {
        inputsProcessed: [
          'masteryScores', 'learningProfile', 'mistakeStats',
          'sessionHistory', 'preferredTopics', 'availableStudyTime',
        ],
        strategiesUsed,
        generationTimeMs: Date.now() - startTime,
      },
    };
  }

  // ============================================
  // Deduplication
  // ============================================

  private deduplicate(recs: Recommendation[]): Recommendation[] {
    const seen = new Map<string, Recommendation>();
    for (const rec of recs) {
      const existing = seen.get(rec.nodeId);
      if (!existing || rec.confidenceScore > existing.confidenceScore) {
        seen.set(rec.nodeId, rec);
      }
    }
    return [...seen.values()];
  }

  // ============================================
  // Time Budget Fitting
  // ============================================

  private fitBudget(
    recs: Recommendation[],
    availableMinutes: number,
    maxRecs: number,
  ): Recommendation[] {
    if (availableMinutes <= 0 || recs.length === 0) return recs.slice(0, maxRecs);

    const result: Recommendation[] = [];
    let remaining = availableMinutes;

    for (const rec of recs) {
      if (result.length >= maxRecs) break;
      if (rec.estimatedTime <= remaining || result.length < 3) {
        result.push(rec);
        remaining -= Math.min(rec.estimatedTime, remaining);
      }
    }

    // Ensure at least 3 recommendations if possible
    if (result.length < 3 && recs.length >= 3) {
      for (const rec of recs) {
        if (result.length >= 3) break;
        if (!result.includes(rec)) result.push(rec);
      }
    }

    return result.slice(0, maxRecs);
  }

  // ============================================
  // Summary Builder
  // ============================================

  private buildSummary(recs: Recommendation[]): RecommendationResult['summary'] {
    const byType: Record<string, number> = {};
    const bySkill: Record<string, number> = {};
    let mustDo = 0, shouldDo = 0, couldDo = 0;

    for (const r of recs) {
      byType[r.type] = (byType[r.type] || 0) + 1;
      bySkill[r.skill] = (bySkill[r.skill] || 0) + 1;
      if (r.priority === 'must-do') mustDo++;
      else if (r.priority === 'should-do') shouldDo++;
      else couldDo++;
    }

    return {
      total: recs.length,
      byType,
      byPriority: { mustDo, shouldDo, couldDo },
      bySkill,
    };
  }
}
