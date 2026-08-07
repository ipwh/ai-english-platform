// ============================================
// Snapshot System — immutable record of each AI generation
//
// Every evaluation saves a snapshot containing:
// - Prompt version + text
// - Provider + model
// - Parameters (temperature, seed)
// - Git commit
// - Evaluation report ID
// ============================================

import type { SemVer } from './prompt-metadata';

/** Complete snapshot of an AI generation context */
export interface PromptSnapshot {
  /** Unique snapshot ID (UUID v4) */
  snapshotId: string;
  /** Prompt identifier (name@version) */
  promptId: string;
  /** Prompt version */
  promptVersion: SemVer;
  /** The full prompt text that was sent */
  promptText: string;
  /** Name of the prompt builder function */
  builderName: string;
  /** Provider that generated the response */
  provider: string;
  /** Model identifier (e.g. "deepseek-chat", "gemini-2.5-flash") */
  model: string;
  /** Temperature used */
  temperature: number;
  /** Seed (if supported by provider) */
  seed?: number;
  /** Max tokens */
  maxTokens?: number;
  /** Git commit SHA at time of generation */
  gitCommit: string;
  /** ISO timestamp */
  timestamp: string;
  /** Associated evaluation report ID */
  evaluationReportId?: string;
  /** Golden dataset version used */
  goldenDatasetVersion?: string;
  /** The generated output (for traceability) */
  generatedOutput?: unknown;
  /** Any additional metadata */
  metadata?: Record<string, unknown>;
}

/** Lightweight snapshot summary for listing */
export interface SnapshotSummary {
  snapshotId: string;
  promptId: string;
  promptVersion: SemVer;
  provider: string;
  timestamp: string;
}

/**
 * Snapshot store — in-memory with JSON serialization support.
 * In production, this would use a database.
 */
class SnapshotStore {
  private snapshots = new Map<string, PromptSnapshot>();

  /** Save a snapshot */
  save(snapshot: PromptSnapshot): void {
    this.snapshots.set(snapshot.snapshotId, snapshot);
  }

  /** Get a snapshot by ID (defensive copy) */
  get(snapshotId: string): PromptSnapshot | undefined {
    const snap = this.snapshots.get(snapshotId);
    return snap ? structuredClone(snap) : undefined;
  }

  /** List all snapshot summaries (newest first) */
  list(): SnapshotSummary[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .map(s => ({
        snapshotId: s.snapshotId,
        promptId: s.promptId,
        promptVersion: s.promptVersion,
        provider: s.provider,
        timestamp: s.timestamp,
      }));
  }

  /** Find snapshots for a specific prompt */
  findByPrompt(promptName: string): SnapshotSummary[] {
    return this.list().filter(s => s.promptId.startsWith(promptName));
  }

  /** Count of stored snapshots */
  get count(): number {
    return this.snapshots.size;
  }

  /** Export all snapshots as JSON (defensive copies) */
  toJSON(): PromptSnapshot[] {
    return Array.from(this.snapshots.values()).map(s => structuredClone(s));
  }
}

/** Singleton snapshot store */
export const snapshotStore = new SnapshotStore();

/** Generate a simple UUID v4 */
export function generateSnapshotId(): string {
  return 'snap_' + Math.random().toString(36).slice(2, 10) +
    '_' + Date.now().toString(36);
}

/** Get current git commit SHA */
export function getGitCommit(): string {
  try {
    // In Node.js, we can read .git/HEAD
    const { execSync } = require('child_process');
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}
