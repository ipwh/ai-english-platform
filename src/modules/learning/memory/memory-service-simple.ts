// ============================================
// Sprint 111: Simplified Memory Service
// Replaces 10 files (engine, service, scoring, profile, influence,
// ai-integration, interface, db-repo, cache-decorator, types)
// with ONE file.
//
// Why simpler:
// - One school doesn't need interface→db→cache layers for a JSON field
// - Direct Prisma read/write is 10 lines, not 300
// - AI memory integration is handled by the prompt, not a separate service
// ============================================

import { logger } from '@/shared/logger/logger';

// Lazy Prisma import (avoids loading DB in test environments)
async function getDb() {
  const { db } = await import('@/shared/db/db');
  return db;
}

export interface StudentMemoryData {
  learningSpeed?: {
    consistencyScore?: number;
    sessionsPerWeek?: number;
    averageSessionDuration?: number;
    completionRate?: number;
  };
  motivation?: {
    motivationLevel?: number;
    intrinsicMotivation?: number;
    extrinsicMotivation?: number;
    motivationTrend?: string;
    engagementScore?: number;
    burnoutRisk?: number;
    recentAchievements?: string[];
  };
  confidence?: {
    overallConfidence?: number;
    confidenceBySkill?: Record<string, number>;
    calibrationAccuracy?: number;
    confidenceTrend?: string;
  };
  learningHabits?: {
    procrastinationIndex?: number;
    preferredTimeOfDay?: string;
    avgSessionLength?: number;
    distractionTendency?: number;
    focusLevel?: number;
    distractionPatterns?: string[];
  };
  weaknesses?: {
    persistentWeaknesses?: Array<{ topic: string; topicZh?: string; count: number }>;
  };
  grammar?: {
    masteredTopics?: string[];
    strugglingTopics?: Array<{ topic: string; topicZh?: string; count: number }>;
  };
  vocabulary?: {
    learnedCount?: number;
    masteredCount?: number;
    reviewQueueCount?: number;
  };
  writing?: {
    essaysSubmitted?: number;
    averageScore?: number;
    commonMistakes?: string[];
  };
}

/**
 * Simple memory service for one school.
 * Reads/writes student memory as a JSON blob in LearningMemory table.
 */
export const memoryService = {
  async get(studentId: string): Promise<StudentMemoryData | null> {
    try {
      const db = await getDb();
      const record = await db.learningMemory.findUnique({
        where: { studentId },
        select: { memoryJson: true },
      });
      if (!record?.memoryJson) return null;
      return JSON.parse(record.memoryJson) as StudentMemoryData;
    } catch (err) {
      logger.error({ module: 'memory-service', studentId, error: String(err) }, 'Failed to get memory');
      return null;
    }
  },

  async save(studentId: string, data: StudentMemoryData): Promise<void> {
    try {
      const db = await getDb();
      await db.learningMemory.upsert({
        where: { studentId },
        create: { studentId, memoryJson: JSON.stringify(data), version: 1 },
        update: { memoryJson: JSON.stringify(data), version: { increment: 1 } },
      });
    } catch (err) {
      logger.error({ module: 'memory-service', studentId, error: String(err) }, 'Failed to save memory');
    }
  },

  async update(studentId: string, patch: Partial<StudentMemoryData>): Promise<StudentMemoryData | null> {
    const current = await this.get(studentId) || {};
    const merged = { ...current, ...patch };
    // Deep merge nested objects
    for (const key of Object.keys(patch) as Array<keyof StudentMemoryData>) {
      if (typeof patch[key] === 'object' && patch[key] !== null && typeof current[key] === 'object') {
        merged[key] = { ...(current[key] as object), ...(patch[key] as object) } as never;
      }
    }
    await this.save(studentId, merged);
    return merged;
  },
};
