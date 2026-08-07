// ============================================
// MemoryStore<T> — In-memory implementation
// of Repository<T>.
//
// Used for testing, development, and as a
// fallback when no persistent backend is
// configured.
// ============================================

import { Repository } from './repository';
import type { Identifiable, QueryCriteria } from '../types';

/**
 * In-memory implementation of {@link Repository}.
 *
 * Stores items in a Map. Supports the full Repository
 * contract: save, load, delete, exists, list with
 * filtering, sorting, pagination.
 *
 * @typeParam T — The entity type (must be Identifiable)
 *
 * @example
 * ```ts
 * const store = new MemoryStore<PromptMeta>();
 * await store.save({ id: 'reading@1.0.0', name: 'reading', version: '1.0.0' });
 * const item = await store.load('reading@1.0.0');
 * ```
 */
export class MemoryStore<T extends Identifiable> extends Repository<T> {
  private data = new Map<string, T>();

  /**
   * Save an item (upsert).
   */
  async save(item: T): Promise<T> {
    this.data.set(item.id, structuredClone(item));
    return this.data.get(item.id)!;
  }

  /**
   * Load an item by ID.
   */
  async load(id: string): Promise<T | undefined> {
    const item = this.data.get(id);
    return item ? structuredClone(item) : undefined;
  }

  /**
   * Delete an item by ID.
   */
  async delete(id: string): Promise<boolean> {
    return this.data.delete(id);
  }

  /**
   * Check if an item exists.
   */
  async exists(id: string): Promise<boolean> {
    return this.data.has(id);
  }

  /**
   * List all items, with optional filtering, sorting, and pagination.
   */
  async list(criteria?: QueryCriteria<T>): Promise<T[]> {
    let items = Array.from(this.data.values()).map(v => structuredClone(v));

    if (criteria?.filter) {
      items = items.filter(criteria.filter);
    }

    if (criteria?.sort) {
      items.sort(criteria.sort);
    }

    if (criteria?.offset) {
      items = items.slice(criteria.offset);
    }

    if (criteria?.limit !== undefined) {
      items = items.slice(0, criteria.limit);
    }

    return items;
  }

  /**
   * Get the number of stored items.
   */
  async count(): Promise<number> {
    return this.data.size;
  }

  /**
   * Clear all items.
   */
  clear(): void {
    this.data.clear();
  }

  /**
   * Get all stored keys.
   */
  keys(): string[] {
    return Array.from(this.data.keys());
  }

  /**
   * Get all stored values (defensive copies).
   */
  values(): T[] {
    return Array.from(this.data.values()).map(v => structuredClone(v));
  }
}
