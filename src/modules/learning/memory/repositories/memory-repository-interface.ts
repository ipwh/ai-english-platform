// Sprint 75: Canonical Memory Repository Interface
// All memory consumers depend on this interface, never on implementations.

import type { LearningMemory } from '../types';

export interface IMemoryRepository {
  /** Get a student's memory, or null if not found */
  get(studentId: string): Promise<LearningMemory | null>;

  /** Save (upsert) a student's memory */
  save(studentId: string, memory: LearningMemory): Promise<void>;

  /** Check if a student has memory */
  has(studentId: string): Promise<boolean>;

  /** Delete a student's memory */
  delete(studentId: string): Promise<boolean>;

  /** Get all stored student IDs */
  getAllStudentIds(): Promise<string[]>;

  /** Count stored memories */
  count(): Promise<number>;
}
