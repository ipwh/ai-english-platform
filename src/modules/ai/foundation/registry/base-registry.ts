// ============================================
// BaseRegistry<T> — Generic, strongly-typed,
// dependency-free, deterministic registry.
//
// Provides: register, update, remove, exists,
// get, list, find, history, clear, size.
//
// All PromptOps registries (experiment, prompt,
// release, etc.) build upon this foundation.
// ============================================

import type { Identifiable, RegistryEntry } from '../types';

/**
 * A generic, strongly-typed registry for any identifiable entity.
 *
 * @typeParam T — The entity type. Must satisfy `Identifiable`
 *   (i.e., have a string `id` property).
 *
 * @remarks
 * Designed to be:
 * - **Generic**: Works with any entity type
 * - **Deterministic**: No side effects beyond registration
 * - **Dependency-free**: Pure TypeScript, no framework dependencies
 * - **Immutable reads**: list() and history() return defensive copies
 *
 * @example
 * ```ts
 * interface PromptMeta { id: string; name: string; version: string; }
 * const registry = new BaseRegistry<PromptMeta>();
 * registry.register({ id: 'reading@1.0.0', name: 'reading', version: '1.0.0' });
 * ```
 */
export class BaseRegistry<T extends Identifiable> {
  /** Primary storage: id → entry */
  protected items = new Map<string, RegistryEntry<T>>();

  /** Revision counter for history tracking */
  private revision = 0;

  // ── Core CRUD ──

  /**
   * Register a new item. Throws if the item id already exists.
   *
   * @param item — The item to register
   * @returns The created registry entry
   * @throws {Error} If an item with the same id is already registered
   */
  register(item: T): RegistryEntry<T> {
    if (this.items.has(item.id)) {
      throw new Error(`Item "${item.id}" is already registered. Use update() to modify.`);
    }

    const entry: RegistryEntry<T> = {
      item: this.cloneItem(item),
      registeredAt: new Date().toISOString(),
      version: ++this.revision,
    };

    this.items.set(item.id, entry);
    return entry;
  }

  /**
   * Update an existing item. Throws if the item is not found.
   *
   * @param id — The item id to update
   * @param updates — Partial updates to apply
   * @returns The updated registry entry
   * @throws {Error} If the item is not registered
   */
  update(id: string, updates: Partial<T>): RegistryEntry<T> {
    const existing = this.items.get(id);
    if (!existing) {
      throw new Error(`Item "${id}" not found. Use register() to create.`);
    }

    const updatedItem: T = { ...existing.item, ...updates } as T;
    const entry: RegistryEntry<T> = {
      item: this.cloneItem(updatedItem),
      registeredAt: existing.registeredAt,
      version: ++this.revision,
    };

    this.items.set(id, entry);
    return entry;
  }

  /**
   * Remove an item from the registry.
   *
   * @param id — The item id to remove
   * @returns true if the item was removed, false if not found
   */
  remove(id: string): boolean {
    return this.items.delete(id);
  }

  /**
   * Check if an item exists in the registry.
   *
   * @param id — The item id to check
   * @returns true if the item is registered
   */
  exists(id: string): boolean {
    return this.items.has(id);
  }

  /**
   * Get an item by id.
   *
   * @param id — The item id to retrieve
   * @returns The item, or undefined if not found
   */
  get(id: string): T | undefined {
    const entry = this.items.get(id);
    return entry ? this.cloneItem(entry.item) : undefined;
  }

  /**
   * Get the raw registry entry (includes metadata).
   *
   * @param id — The item id
   * @returns The registry entry, or undefined if not found
   */
  getEntry(id: string): RegistryEntry<T> | undefined {
    return this.items.get(id);
  }

  /**
   * List all registered items (defensive copies).
   *
   * @returns Array of all items, in insertion order
   */
  list(): T[] {
    return Array.from(this.items.values()).map(e => this.cloneItem(e.item));
  }

  /**
   * List all registry entries with metadata.
   *
   * @returns Array of all registry entries
   */
  listEntries(): RegistryEntry<T>[] {
    return Array.from(this.items.values());
  }

  /**
   * Find items matching a predicate.
   *
   * @param predicate — Filter function
   * @returns Array of matching items
   */
  find(predicate: (item: T) => boolean): T[] {
    return this.list().filter(predicate);
  }

  /**
   * Find a single item matching a predicate.
   *
   * @param predicate — Filter function
   * @returns The first matching item, or undefined
   */
  findOne(predicate: (item: T) => boolean): T | undefined {
    return this.list().find(predicate);
  }

  /**
   * Get the full insertion-order history of an item.
   * Note: This returns the current state — for true version
   * history, use {@link HistoryRegistry}.
   *
   * @param id — The item id
   * @returns The current entry, or undefined
   */
  history(id: string): RegistryEntry<T> | undefined {
    return this.items.get(id);
  }

  /**
   * Clear all items from the registry.
   */
  clear(): void {
    this.items.clear();
    this.revision = 0;
  }

  /**
   * Get the number of registered items.
   */
  size(): number {
    return this.items.size;
  }

  /**
   * Get the current revision number (monotonically increasing).
   */
  get revisionNumber(): number {
    return this.revision;
  }

  // ── Internal ──

  /**
   * Create a defensive clone of an item.
   * Uses structuredClone for deep cloning to prevent callers
   * from mutating stored state via shared references.
   * Override in subclasses for custom cloning behavior.
   */
  protected cloneItem(item: T): T {
    return structuredClone(item);
  }
}
