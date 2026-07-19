// Sprint 22: Recommendation Repository — caching and persistence
import type { RecommendationInput, RecommendationResult } from '../types';
import { RecommendationEngine } from '../services/recommendation-engine';

class RecommendationRepository {
  private cache = new Map<string, { result: RecommendationResult; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cached recommendations or generate new ones.
   * Cache key is derived from input to ensure determinism.
   */
  getOrGenerate(input: RecommendationInput): RecommendationResult {
    const cacheKey = this.buildCacheKey(input);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
      return cached.result;
    }

    const engine = new RecommendationEngine();
    const result = engine.generate(input);

    this.cache.set(cacheKey, { result, expiresAt: Date.now() + this.CACHE_TTL_MS });

    // Limit cache size
    if (this.cache.size > 100) {
      const oldest = [...this.cache.entries()]
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }

    return result;
  }

  /** Invalidate cache for a student */
  invalidate(studentId: string): void {
    for (const [key] of this.cache) {
      if (key.includes(studentId)) this.cache.delete(key);
    }
  }

  /** Clear all cached recommendations */
  clearAll(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  private buildCacheKey(input: RecommendationInput): string {
    // Deterministic key: student + grade + available time + hash of mastery scores
    const masteryHash = input.masteryScores
      .map(m => `${m.nodeId}:${m.currentMastery}`)
      .sort()
      .join(',');
    return `${input.studentId}|${input.gradeLevel}|${input.availableStudyTime}|${masteryHash}`;
  }
}

export const recommendationRepo = new RecommendationRepository();
