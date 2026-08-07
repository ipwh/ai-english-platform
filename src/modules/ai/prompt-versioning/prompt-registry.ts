// ============================================
// Prompt Registry — centralized prompt lifecycle management
//
// Extends the existing prompt-registry.ts with version
// history, category filtering, and latest/previous lookups.
// Builds on the existing registerPrompt/getPrompt/listPrompts API.
// ============================================

import type { PromptMetadata, SemVer, PromptCategory } from './prompt-metadata';

/**
 * Extended prompt registry with version history.
 * Wraps the existing simple registry with version-aware operations.
 */
class PromptVersionRegistry {
  /** All known versions, keyed by promptId (name@version) */
  private versions = new Map<string, PromptMetadata>();
  /** Latest version per prompt name */
  private latest = new Map<string, PromptMetadata>();
  /** Version history per prompt name (sorted newest first) */
  private history = new Map<string, PromptMetadata[]>();

  // ── Registration ──

  /** Register a prompt version */
  register(meta: PromptMetadata): void {
    this.versions.set(meta.id, meta);

    // Update latest
    const current = this.latest.get(meta.name);
    if (!current || this.compareVersions(meta.version, current.version) > 0) {
      this.latest.set(meta.name, meta);
    }

    // Update history
    const hist = this.history.get(meta.name) || [];
    hist.push(meta);
    hist.sort((a, b) => this.compareVersions(b.version, a.version));
    this.history.set(meta.name, hist);
  }

  // ── Retrieval ──

  /** Get a specific version */
  get(name: string, version?: SemVer): PromptMetadata | undefined {
    if (version) {
      return this.versions.get(`${name}@${version}`);
    }
    return this.latest.get(name);
  }

  /** Get the latest version of a prompt */
  latestVersion(name: string): PromptMetadata | undefined {
    return this.latest.get(name);
  }

  /** Get the previous version (one before latest) */
  previousVersion(name: string): PromptMetadata | undefined {
    const hist = this.history.get(name);
    if (!hist || hist.length < 2) return undefined;
    return hist[1]; // sorted newest first, so index 1 is previous
  }

  /** List all prompts (latest version of each) */
  list(): PromptMetadata[] {
    return Array.from(this.latest.values());
  }

  /** List all versions of all prompts */
  listAll(): PromptMetadata[] {
    return Array.from(this.versions.values());
  }

  /** Find prompts by category */
  findByCategory(category: PromptCategory): PromptMetadata[] {
    return this.list().filter(p => p.category === category);
  }

  /** Get full version history for a prompt */
  getHistory(name: string): PromptMetadata[] {
    return this.history.get(name) || [];
  }

  /** Get the count of registered prompts (latest versions) */
  get count(): number {
    return this.latest.size;
  }

  /** Get total version count */
  get totalVersions(): number {
    return this.versions.size;
  }

  // ── Helpers ──

  private compareVersions(a: SemVer, b: SemVer): number {
    const [am, amin, ap] = a.split('.').map(Number);
    const [bm, bmin, bp] = b.split('.').map(Number);
    if (am !== bm) return am - bm;
    if (amin !== bmin) return amin - bmin;
    return ap - bp;
  }
}

/** Singleton prompt version registry */
export const promptVersionRegistry = new PromptVersionRegistry();
