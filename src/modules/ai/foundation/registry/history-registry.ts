// ============================================
// HistoryRegistry<T> — Full version history
// with immutable snapshots for every mutation.
//
// Provides: audit trail, time-travel queries,
// and diff-friendly history for debugging &
// compliance.
// ============================================

import type { Identifiable } from '../types';

/**
 * A single snapshot in the history chain.
 */
export interface HistorySnapshot<T> {
  /** The item state at this point in time */
  item: T;
  /** When this snapshot was recorded */
  timestamp: string;
  /** Monotonically increasing version number */
  version: number;
  /** What kind of mutation produced this snapshot */
  action: 'register' | 'update' | 'remove';
}

/**
 * A registry that maintains a full, immutable audit trail
 * of every mutation. Supports time-travel queries and
 * diff-friendly history for debugging and compliance.
 *
 * @typeParam T — Must satisfy `Identifiable`
 *
 * @remarks
 * Every call to register(), update(), or remove()
 * appends an immutable snapshot. The full history
 * chain is preserved until clear() is called.
 *
 * @example
 * ```ts
 * const registry = new HistoryRegistry<{ id: string; value: number }>();
 * registry.register({ id: 'counter', value: 0 });
 * registry.update('counter', { value: 1 });
 * registry.update('counter', { value: 2 });
 *
 * const hist = registry.history('counter');
 * // hist.length === 3
 * // hist[0].item.value === 0 (original register)
 * // hist[2].item.value === 2 (latest)
 * ```
 */
export class HistoryRegistry<T extends Identifiable> {
  /** Current state: id → item */
  private current = new Map<string, T>();

  /** Full history: id → snapshot chain (oldest first) */
  private snapshots = new Map<string, HistorySnapshot<T>[]>();

  /** Global revision counter */
  private revision = 0;

  // ── Core CRUD ──

  /**
   * Register a new item and record the initial snapshot.
   *
   * @param item — The item to register
   * @returns The created snapshot
   * @throws {Error} If an item with the same id already exists
   */
  register(item: T): HistorySnapshot<T> {
    if (this.current.has(item.id)) {
      throw new Error(`Item "${item.id}" is already registered. Use update() to modify.`);
    }

    const snapshot: HistorySnapshot<T> = {
      item: structuredClone(item),
      timestamp: new Date().toISOString(),
      version: ++this.revision,
      action: 'register',
    };

    this.current.set(item.id, structuredClone(item));
    this.snapshots.set(item.id, [snapshot]);

    return snapshot;
  }

  /**
   * Update an existing item and record a snapshot.
   *
   * @param id — The item id
   * @param updates — Partial updates to apply
   * @returns The update snapshot
   * @throws {Error} If the item is not found
   */
  update(id: string, updates: Partial<T>): HistorySnapshot<T> {
    const existing = this.current.get(id);
    if (!existing) {
      throw new Error(`Item "${id}" not found.`);
    }

    const updated: T = { ...existing, ...updates } as T;

    const snapshot: HistorySnapshot<T> = {
      item: structuredClone(updated),
      timestamp: new Date().toISOString(),
      version: ++this.revision,
      action: 'update',
    };

    this.current.set(id, updated);

    const chain = this.snapshots.get(id) ?? [];
    chain.push(snapshot);
    this.snapshots.set(id, chain);

    return snapshot;
  }

  /**
   * Remove an item and record a removal snapshot.
   *
   * @param id — The item id
   * @returns true if removed, false if not found
   */
  remove(id: string): boolean {
    if (!this.current.has(id)) return false;

    const existing = this.current.get(id)!;

    const snapshot: HistorySnapshot<T> = {
      item: structuredClone(existing),
      timestamp: new Date().toISOString(),
      version: ++this.revision,
      action: 'remove',
    };

    this.current.delete(id);

    const chain = this.snapshots.get(id) ?? [];
    chain.push(snapshot);
    this.snapshots.set(id, chain);

    return true;
  }

  // ── Queries ──

  /**
   * Get the current state of an item.
   *
   * @param id — The item id
   * @returns Current item, or undefined
   */
  get(id: string): T | undefined {
    const item = this.current.get(id);
    return item ? structuredClone(item) : undefined;
  }

  /**
   * Check if an item exists in current state.
   */
  exists(id: string): boolean {
    return this.current.has(id);
  }

  /**
   * List all items in current state.
   */
  list(): T[] {
    return Array.from(this.current.values()).map(v => structuredClone(v));
  }

  /**
   * Find items matching a predicate in current state.
   */
  find(predicate: (item: T) => boolean): T[] {
    return this.list().filter(predicate);
  }

  /**
   * Get the full history chain for an item (oldest first).
   *
   * @param id — The item id
   * @returns Array of snapshots, or empty array if never registered
   */
  history(id: string): HistorySnapshot<T>[] {
    return [...(this.snapshots.get(id) ?? [])];
  }

  /**
   * Get the item state at a specific revision.
   *
   * @param id — The item id
   * @param version — The revision number to query
   * @returns The item state at that revision, or undefined
   */
  atVersion(id: string, version: number): T | undefined {
    const chain = this.snapshots.get(id);
    if (!chain) return undefined;

    // Find the snapshot at or before the given version
    for (let i = chain.length - 1; i >= 0; i--) {
      if (chain[i].version <= version) {
        return chain[i].action === 'remove' ? undefined : { ...chain[i].item };
      }
    }

    return undefined;
  }

  /**
   * Get the item state at a specific timestamp.
   *
   * @param id — The item id
   * @param timestamp — ISO timestamp to query
   * @returns The item state at that time, or undefined
   */
  atTime(id: string, timestamp: string): T | undefined {
    const chain = this.snapshots.get(id);
    if (!chain) return undefined;

    const targetTime = new Date(timestamp).getTime();

    for (let i = chain.length - 1; i >= 0; i--) {
      const snapTime = new Date(chain[i].timestamp).getTime();
      if (snapTime <= targetTime) {
        return chain[i].action === 'remove' ? undefined : structuredClone(chain[i].item);
      }
    }

    return undefined;
  }

  /**
   * Get the latest snapshot for an item.
   */
  latestSnapshot(id: string): HistorySnapshot<T> | undefined {
    const chain = this.snapshots.get(id);
    if (!chain || chain.length === 0) return undefined;
    return chain[chain.length - 1];
  }

  /**
   * Get the number of items in current state.
   */
  size(): number {
    return this.current.size;
  }

  /**
   * Get the total number of snapshots across all items.
   */
  totalSnapshots(): number {
    let count = 0;
    for (const chain of this.snapshots.values()) {
      count += chain.length;
    }
    return count;
  }

  /**
   * Get the current global revision number.
   */
  get revisionNumber(): number {
    return this.revision;
  }

  // ── Diff ──

  /**
   * Compute the diff between two versions of an item.
   *
   * @param id — The item id
   * @param fromVersion — Source version
   * @param toVersion — Target version (defaults to latest)
   * @returns Object with added, removed, and changed keys
   */
  diff(
    id: string,
    fromVersion: number,
    toVersion?: number,
  ): { added: string[]; removed: string[]; changed: string[] } | undefined {
    const from = this.atVersion(id, fromVersion);
    const to = toVersion !== undefined ? this.atVersion(id, toVersion) : this.get(id);

    if (!from || !to) return undefined;

    const fromKeys = Object.keys(from as Record<string, unknown>);
    const toKeys = Object.keys(to as Record<string, unknown>);

    const added = toKeys.filter(k => !fromKeys.includes(k));
    const removed = fromKeys.filter(k => !toKeys.includes(k));
    const changed = fromKeys.filter(k => {
      if (!toKeys.includes(k)) return false;
      return JSON.stringify((from as Record<string, unknown>)[k]) !==
             JSON.stringify((to as Record<string, unknown>)[k]);
    });

    return { added, removed, changed };
  }

  /**
   * Clear all items and history.
   */
  clear(): void {
    this.current.clear();
    this.snapshots.clear();
    this.revision = 0;
  }
}
