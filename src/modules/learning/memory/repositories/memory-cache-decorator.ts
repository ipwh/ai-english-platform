// Sprint 75: MemoryCacheDecorator — optional cache layer wrapping any IMemoryRepository
// Cache is NEVER the source of truth. All writes go through to the underlying repository.
// TTL-based expiration ensures cache doesn't serve stale data indefinitely.

import type { LearningMemory } from '../types';
import type { IMemoryRepository } from './memory-repository-interface';

interface CacheEntry {
  memory: LearningMemory;
  loadedAt: number;
}

export class MemoryCacheDecorator implements IMemoryRepository {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;

  constructor(
    private inner: IMemoryRepository,
    ttlSeconds = 300, // 5 minutes default
  ) {
    this.ttlMs = ttlSeconds * 1000;
  }

  async get(studentId: string): Promise<LearningMemory | null> {
    const cached = this.cache.get(studentId);
    if (cached && (Date.now() - cached.loadedAt) < this.ttlMs) {
      return cached.memory;
    }
    // Cache miss or expired — load from inner repository
    const memory = await this.inner.get(studentId);
    if (memory) {
      this.cache.set(studentId, { memory, loadedAt: Date.now() });
    } else {
      this.cache.delete(studentId); // clear stale
    }
    return memory;
  }

  async save(studentId: string, memory: LearningMemory): Promise<void> {
    await this.inner.save(studentId, memory);
    // Update cache immediately (write-through)
    this.cache.set(studentId, { memory, loadedAt: Date.now() });
  }

  async has(studentId: string): Promise<boolean> {
    if (this.cache.has(studentId)) return true;
    return this.inner.has(studentId);
  }

  async delete(studentId: string): Promise<boolean> {
    this.cache.delete(studentId);
    return this.inner.delete(studentId);
  }

  async getAllStudentIds(): Promise<string[]> {
    return this.inner.getAllStudentIds();
  }

  async count(): Promise<number> {
    return this.inner.count();
  }

  /** Invalidate a specific student's cache entry */
  invalidate(studentId: string): void {
    this.cache.delete(studentId);
  }

  /** Clear entire cache */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get cache stats for monitoring */
  getCacheStats(): { size: number; ttlMs: number } {
    return { size: this.cache.size, ttlMs: this.ttlMs };
  }
}
