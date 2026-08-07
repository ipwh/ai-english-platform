// ============================================
// VersionedRegistry<T> — Extends BaseRegistry
// with SemVer-aware operations.
//
// Provides: latest, previous, rollback, version
// lookup, and full version history.
// ============================================

import { BaseRegistry } from './base-registry';
import { compareSemVer } from '../types';
import type { Identifiable, SemVer, Versioned } from '../types';

/**
 * Required interface for versioned entities.
 * Extends Identifiable with a version field.
 */
export interface VersionedEntity extends Identifiable, Versioned {
  /** Optional grouping key (e.g., prompt name for prompt versions) */
  groupKey?: string;
}

/**
 * Options for get() when using version resolution.
 */
export interface VersionLookupOptions {
  /** Specific version to retrieve */
  version?: SemVer;
  /** If true, returns latest version when no version specified */
  latest?: boolean;
}

/**
 * A registry that understands SemVer versioning.
 *
 * Extends {@link BaseRegistry} with version-aware operations
 * including latest/previous lookups, version comparison,
 * and rollback support.
 *
 * @typeParam T — Must extend {@link VersionedEntity}
 *
 * @example
 * ```ts
 * interface PromptVariant extends VersionedEntity {
 *   name: string;
 *   template: string;
 * }
 *
 * const registry = new VersionedRegistry<PromptVariant>();
 * registry.register({ id: 'reading@1.0.0', name: 'reading', version: '1.0.0', template: '...' });
 * registry.register({ id: 'reading@2.0.0', name: 'reading', version: '2.0.0', template: '...' });
 *
 * const latest = registry.latest('reading'); // v2.0.0
 * const prev = registry.previous('reading'); // v1.0.0
 * ```
 */
export class VersionedRegistry<T extends VersionedEntity> extends BaseRegistry<T> {
  /** Index: groupKey → sorted version list (newest first) */
  private versionIndex = new Map<string, T[]>();

  /** Index: groupKey → latest version */
  private latestIndex = new Map<string, T>();

  // ── Registration Override ──

  /**
   * Register a versioned item and maintain version indexes.
   *
   * @override
   */
  register(item: T): ReturnType<BaseRegistry<T>['register']> {
    const result = super.register(item);
    this.updateIndexes(item);
    return result;
  }

  /**
   * Update a versioned item and refresh indexes.
   *
   * @override
   */
  update(id: string, updates: Partial<T>): ReturnType<BaseRegistry<T>['update']> {
    const result = super.update(id, updates);
    const updated = this.get(id);
    if (updated) {
      this.updateIndexes(updated);
    }
    return result;
  }

  /**
   * Remove a versioned item and clean up indexes.
   *
   * @override
   */
  remove(id: string): boolean {
    const item = this.get(id);
    const result = super.remove(id);
    if (item && item.groupKey) {
      this.rebuildGroupIndex(item.groupKey);
    }
    return result;
  }

  // ── Version Queries ──

  /**
   * Get the latest version of items with a given group key.
   *
   * @param groupKey — The group identifier (e.g., prompt name)
   * @returns The latest versioned item, or undefined
   */
  latest(groupKey: string): T | undefined {
    const item = this.latestIndex.get(groupKey);
    return item ? this.cloneItem(item) : undefined;
  }

  /**
   * Get the previous version (one before latest).
   *
   * @param groupKey — The group identifier
   * @returns The previous version, or undefined if fewer than 2 versions exist
   */
  previous(groupKey: string): T | undefined {
    const versions = this.versionIndex.get(groupKey);
    if (!versions || versions.length < 2) return undefined;
    return this.cloneItem(versions[1]); // sorted newest first, index 1 = previous
  }

  /**
   * Get a specific version by group key and version.
   *
   * @param groupKey — The group identifier
   * @param version — The specific version to retrieve
   * @returns The matching item, or undefined
   */
  getVersion(groupKey: string, version: SemVer): T | undefined {
    const versions = this.versionIndex.get(groupKey);
    if (!versions) return undefined;
    const found = versions.find(v => v.version === version);
    return found ? this.cloneItem(found) : undefined;
  }

  /**
   * Get version history for a group (all versions, newest first).
   *
   * @param groupKey — The group identifier
   * @returns Array of versions, sorted newest first (defensive copies)
   */
  versionHistory(groupKey: string): T[] {
    return (this.versionIndex.get(groupKey) ?? []).map(v => this.cloneItem(v));
  }

  /**
   * Get the version count for a group.
   *
   * @param groupKey — The group identifier
   * @returns Number of versions registered
   */
  versionCount(groupKey: string): number {
    return this.versionIndex.get(groupKey)?.length ?? 0;
  }

  /**
   * List all groups (distinct group keys).
   *
   * @returns Array of group key strings
   */
  listGroups(): string[] {
    return Array.from(this.versionIndex.keys());
  }

  /**
   * Get the latest version of every group.
   *
   * @returns Array of latest items per group (defensive copies)
   */
  listLatest(): T[] {
    return Array.from(this.latestIndex.values()).map(v => this.cloneItem(v));
  }

  /**
   * Compare two versions within the same group.
   *
   * @param groupKey — The group identifier
   * @param versionA — First version
   * @param versionB — Second version
   * @returns negative if A < B, 0 if equal, positive if A > B
   */
  compare(groupKey: string, versionA: SemVer, versionB: SemVer): number {
    return compareSemVer(versionA, versionB);
  }

  // ── Rollback ──

  /**
   * Get the rollback target (previous version).
   * Alias for {@link previous} with semantic intent.
   *
   * @param groupKey — The group identifier
   * @returns The version to roll back to, or undefined
   */
  rollbackTarget(groupKey: string): T | undefined {
    return this.previous(groupKey);
  }

  // ── Internal ──

  /**
   * Update version indexes after registration or update.
   */
  private updateIndexes(item: T): void {
    const key = item.groupKey ?? item.id;
    let versions = this.versionIndex.get(key) ?? [];

    // Remove existing entry for this id if present
    versions = versions.filter(v => v.id !== item.id);
    versions.push(item);

    // Sort newest first
    versions.sort((a, b) => compareSemVer(b.version, a.version));
    this.versionIndex.set(key, versions);

    // Update latest
    this.latestIndex.set(key, versions[0]);
  }

  /**
   * Rebuild version index for a group after removal.
   */
  private rebuildGroupIndex(groupKey: string): void {
    const allItems = this.list();
    const groupItems = allItems.filter(i => (i.groupKey ?? i.id) === groupKey);
    groupItems.sort((a, b) => compareSemVer(b.version, a.version));

    if (groupItems.length === 0) {
      this.versionIndex.delete(groupKey);
      this.latestIndex.delete(groupKey);
    } else {
      this.versionIndex.set(groupKey, groupItems);
      this.latestIndex.set(groupKey, groupItems[0]);
    }
  }
}
