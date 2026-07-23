// Sprint 25: Memory Repository — in-memory persistence with serialization
import type { LearningMemory } from '../types';
import { createEmptyMemory } from '../services/memory-service';

class MemoryRepository {
  private store = new Map<string, LearningMemory>();
  private saveCallbacks: Array<(studentId: string, memory: LearningMemory) => void> = [];

  /** Get a student's memory, creating empty if not exists */
  get(studentId: string): LearningMemory {
    if (!this.store.has(studentId)) {
      this.store.set(studentId, createEmptyMemory(studentId));
    }
    return this.store.get(studentId)!;
  }

  /** Save (upsert) a student's memory */
  save(studentId: string, memory: LearningMemory): void {
    memory.updatedAt = new Date();
    memory.version++;
    this.store.set(studentId, memory);
    for (const cb of this.saveCallbacks) {
      try { cb(studentId, memory); } catch { /* fire-and-forget */ }
    }
  }

  /** Check if a student has memory */
  has(studentId: string): boolean {
    return this.store.has(studentId);
  }

  /** Delete a student's memory */
  delete(studentId: string): boolean {
    return this.store.delete(studentId);
  }

  /** Get all stored student IDs */
  getAllStudentIds(): string[] {
    return [...this.store.keys()];
  }

  /** Count stored memories */
  get count(): number {
    return this.store.size;
  }

  /** Register a persistence callback (e.g., for DB save) */
  onSave(callback: (studentId: string, memory: LearningMemory) => void): void {
    this.saveCallbacks.push(callback);
  }

  /** Export all memories as JSON */
  exportAll(): Record<string, LearningMemory> {
    const result: Record<string, LearningMemory> = {};
    for (const [id, mem] of this.store) {
      result[id] = mem;
    }
    return result;
  }

  /** Import memories from JSON */
  importAll(data: Record<string, LearningMemory>): void {
    for (const [id, mem] of Object.entries(data)) {
      this.store.set(id, mem);
    }
  }

  /** Clear all memories */
  clear(): void {
    this.store.clear();
  }
}

export const memoryRepo = new MemoryRepository();
