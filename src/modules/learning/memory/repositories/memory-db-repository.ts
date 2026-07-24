// Sprint 75: MemoryDbRepository — Prisma-backed persistence
// Implements IMemoryRepository — the canonical persistent store for learning memory.
// No cache logic. No learning algorithms. Pure persistence + mapping.

import { db } from '@/shared/db/db';
import type { LearningMemory } from '../types';
import type { IMemoryRepository } from './memory-repository-interface';
import { logger } from '@/shared/logger/logger';

export class MemoryDbRepository implements IMemoryRepository {
  async get(studentId: string): Promise<LearningMemory | null> {
    try {
      const record = await db.learningMemory.findUnique({ where: { studentId } });
      if (!record?.memoryJson) return null;
      const parsed = JSON.parse(record.memoryJson) as LearningMemory;
      parsed.createdAt = new Date(parsed.createdAt);
      parsed.updatedAt = new Date(parsed.updatedAt);
      return parsed;
    } catch (err) {
      logger.error({ module: 'memory-db', error: (err as Error)?.message }, 'Failed to load learning memory');
      return null;
    }
  }

  async save(studentId: string, memory: LearningMemory): Promise<void> {
    memory.updatedAt = new Date();
    memory.version++;
    try {
      const json = JSON.stringify(memory);
      await db.learningMemory.upsert({
        where: { studentId },
        create: { studentId, memoryJson: json, version: memory.version },
        update: { memoryJson: json, version: memory.version },
      });
    } catch (err) {
      logger.error({ module: 'memory-db', error: (err as Error)?.message }, 'Failed to persist learning memory');
    }
  }

  async has(studentId: string): Promise<boolean> {
    try {
      const count = await db.learningMemory.count({ where: { studentId } });
      return count > 0;
    } catch { return false; }
  }

  async delete(studentId: string): Promise<boolean> {
    try {
      await db.learningMemory.delete({ where: { studentId } });
      return true;
    } catch { return false; }
  }

  async getAllStudentIds(): Promise<string[]> {
    try {
      const records = await db.learningMemory.findMany({ select: { studentId: true } });
      return records.map(r => r.studentId);
    } catch { return []; }
  }

  async count(): Promise<number> {
    try { return await db.learningMemory.count(); } catch { return 0; }
  }

  /** Load ALL memories from DB — for migration / init */
  async loadAll(): Promise<Record<string, LearningMemory>> {
    const result: Record<string, LearningMemory> = {};
    try {
      const records = await db.learningMemory.findMany({ select: { studentId: true, memoryJson: true } });
      for (const record of records) {
        try {
          const parsed = JSON.parse(record.memoryJson) as LearningMemory;
          parsed.createdAt = new Date(parsed.createdAt);
          parsed.updatedAt = new Date(parsed.updatedAt);
          result[record.studentId] = parsed;
        } catch { /* skip corrupted */ }
      }
    } catch { /* DB unavailable */ }
    return result;
  }
}

export const memoryDbRepo = new MemoryDbRepository();
