// ============================================
// Prompt Registry — centralized prompt lifecycle management
//
// Built on the shared PromptOps Foundation's
// VersionedRegistry for consistent version-aware
// operations. Provides category filtering,
// latest/previous lookups, and full version history.
// ============================================

import { VersionedRegistry, type VersionedEntity } from '../foundation';
import type { PromptMetadata, SemVer, PromptCategory } from './prompt-metadata';

/**
 * Adapt PromptMetadata to satisfy VersionedEntity for the foundation registry.
 * groupKey is set to the prompt name so versions are grouped by name.
 */
function adaptForRegistry(meta: PromptMetadata): PromptMetadata & VersionedEntity {
  return { ...meta, groupKey: meta.name };
}

/**
 * Extended prompt registry with version history.
 * Built on the shared {@link VersionedRegistry} foundation via composition.
 */
class PromptVersionRegistry {
  /** Foundation-backed versioned store */
  private store = new VersionedRegistry<PromptMetadata & VersionedEntity>();

  // ── Registration ──

  /** Register a prompt version */
  register(meta: PromptMetadata): void {
    this.store.register(adaptForRegistry(meta));
  }

  // ── Retrieval ──

  /** Get a specific version */
  get(name: string, version?: SemVer): PromptMetadata | undefined {
    if (version) {
      return this.store.getVersion(name, version);
    }
    return this.store.latest(name);
  }

  /** Get the latest version of a prompt */
  latestVersion(name: string): PromptMetadata | undefined {
    return this.store.latest(name);
  }

  /** Get the previous version (one before latest) */
  previousVersion(name: string): PromptMetadata | undefined {
    return this.store.previous(name);
  }

  /** List all prompts (latest version of each) */
  list(): PromptMetadata[] {
    return this.store.listLatest();
  }

  /** List all versions of all prompts */
  listAll(): PromptMetadata[] {
    return this.store.list();
  }

  /** Find prompts by category */
  findByCategory(category: PromptCategory): PromptMetadata[] {
    return this.list().filter(p => p.category === category);
  }

  /** Get full version history for a prompt */
  getHistory(name: string): PromptMetadata[] {
    return this.store.versionHistory(name);
  }

  /** Get the count of registered prompts (latest versions) */
  get count(): number {
    return this.store.listGroups().length;
  }

  /** Get total version count */
  get totalVersions(): number {
    return this.store.size();
  }
}

/** Singleton prompt version registry */
export const promptVersionRegistry = new PromptVersionRegistry();
