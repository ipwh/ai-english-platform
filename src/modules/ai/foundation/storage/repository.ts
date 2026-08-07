// ============================================
// Repository<T> — Abstract storage repository
// with save, load, delete, exists, list.
//
// Memory implementation included. Designed for
// dependency injection — swap implementations
// for Prisma, Redis, etc. without changing
// consumers.
// ============================================

import type { Identifiable, QueryCriteria } from '../types';

// ── Repository Interface ──

/**
 * Abstract repository for persistent storage.
 *
 * Provides the canonical CRUD contract. Implementations
 * may be in-memory (testing), Prisma (PostgreSQL), Redis
 * (caching), or any other backend.
 *
 * @typeParam T — The entity type (must be Identifiable)
 *
 * @example
 * ```ts
 * // In-memory for tests
 * const repo = new MemoryStore<PromptMeta>();
 *
 * // Prisma for production
 * class PrismaPromptRepo extends Repository<PromptMeta> {
 *   async save(item) { return prisma.prompt.upsert(...); }
 *   async load(id) { return prisma.prompt.findUnique(...); }
 *   // ...
 * }
 * ```
 */
export abstract class Repository<T extends Identifiable> {
  /**
   * Save an item (create or update).
   *
   * @param item — The item to persist
   * @returns The persisted item
   */
  abstract save(item: T): Promise<T>;

  /**
   * Load an item by ID.
   *
   * @param id — The item identifier
   * @returns The item, or undefined if not found
   */
  abstract load(id: string): Promise<T | undefined>;

  /**
   * Delete an item by ID.
   *
   * @param id — The item identifier
   * @returns true if deleted, false if not found
   */
  abstract delete(id: string): Promise<boolean>;

  /**
   * Check if an item exists.
   *
   * @param id — The item identifier
   */
  abstract exists(id: string): Promise<boolean>;

  /**
   * List all items, optionally filtered and sorted.
   *
   * @param criteria — Optional query criteria
   * @returns Array of matching items
   */
  abstract list(criteria?: QueryCriteria<T>): Promise<T[]>;

  /**
   * Save multiple items in a single operation.
   * Default implementation calls save() for each.
   *
   * @param items — Items to persist
   * @returns The persisted items
   */
  async saveAll(items: T[]): Promise<T[]> {
    const results: T[] = [];
    for (const item of items) {
      results.push(await this.save(item));
    }
    return results;
  }

  /**
   * Delete all items matching a predicate.
   * Default implementation loads all, filters, and deletes.
   *
   * @param predicate — Filter function
   * @returns Number of items deleted
   */
  async deleteWhere(predicate: (item: T) => boolean): Promise<number> {
    const items = await this.list();
    let count = 0;

    for (const item of items) {
      if (predicate(item)) {
        const deleted = await this.delete(item.id);
        if (deleted) count++;
      }
    }

    return count;
  }

  /**
   * Get the number of items.
   */
  async count(): Promise<number> {
    const items = await this.list();
    return items.length;
  }
}
