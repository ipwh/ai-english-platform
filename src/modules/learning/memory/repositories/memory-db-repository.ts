// Sprint 25: Memory DB Repository — Prisma persistence layer
import { db } from '@/shared/db/db';
import type { LearningMemory } from '../types';
import { memoryRepo } from '../repositories/memory-repository';

/**
 * Save a student's learning memory to the database.
 * Called automatically via memoryRepo.onSave() callback.
 */
export async function persistMemoryToDb(studentId: string, memory: LearningMemory): Promise<void> {
  try {
    const json = JSON.stringify(memory);
    await db.learningMemory.upsert({
      where: { studentId },
      create: { studentId, memoryJson: json, version: memory.version },
      update: { memoryJson: json, version: memory.version },
    });
  } catch (err) {
    // Silently fail — memory is still in-memory
    console.error('[memory-db] Failed to persist:', (err as Error)?.message);
  }
}

/**
 * Load a student's learning memory from the database.
 * Returns null if no persisted memory exists.
 */
export async function loadMemoryFromDb(studentId: string): Promise<LearningMemory | null> {
  try {
    const record = await db.learningMemory.findUnique({ where: { studentId } });
    if (!record?.memoryJson) return null;
    const parsed = JSON.parse(record.memoryJson) as LearningMemory;
    // Restore Date objects
    parsed.createdAt = new Date(parsed.createdAt);
    parsed.updatedAt = new Date(parsed.updatedAt);
    return parsed;
  } catch (err) {
    console.error('[memory-db] Failed to load:', (err as Error)?.message);
    return null;
  }
}

/**
 * Delete a student's memory from the database.
 */
export async function deleteMemoryFromDb(studentId: string): Promise<void> {
  try {
    await db.learningMemory.delete({ where: { studentId } });
  } catch {
    // May not exist — that's fine
  }
}

/**
 * Initialize the persistence bridge.
 * After calling this, all memoryRepo.save() calls will also persist to DB.
 */
export function initMemoryPersistence(): void {
  memoryRepo.onSave((studentId, memory) => {
    persistMemoryToDb(studentId, memory);
  });
}

/**
 * Load all persisted memories into the in-memory store.
 */
export async function loadAllMemoriesFromDb(): Promise<string[]> {
  try {
    const records = await db.learningMemory.findMany({ select: { studentId: true, memoryJson: true } });
    let count = 0;
    for (const record of records) {
      try {
        const parsed = JSON.parse(record.memoryJson) as LearningMemory;
        parsed.createdAt = new Date(parsed.createdAt);
        parsed.updatedAt = new Date(parsed.updatedAt);
        memoryRepo.save(record.studentId, parsed);
        count++;
      } catch { /* skip corrupted records */ }
    }
    return records.map(r => r.studentId);
  } catch (err) {
    console.error('[memory-db] Failed to load all:', (err as Error)?.message);
    return [];
  }
}
