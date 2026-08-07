// ============================================
// Experiment Registry — persistent storage and
// retrieval of experiment configurations and results.
//
// Integrates with PromptVersionRegistry and
// ReleaseManager for full traceability.
// ============================================

import type {
  ExperimentConfig, ExperimentResult, ExperimentRecord, ExperimentStatus,
} from './experiment';
import { getGitCommit } from '../prompt-versioning/snapshot';

// ── Experiment Registry ──

class ExperimentRegistry {
  /** All experiments, keyed by experimentId */
  private experiments = new Map<string, ExperimentRecord>();

  /** History per prompt name */
  private promptHistory = new Map<string, ExperimentRecord[]>();

  // ── Registration ──

  /** Register a new experiment configuration */
  register(config: ExperimentConfig): ExperimentRecord {
    const id = config.id;

    if (this.experiments.has(id)) {
      throw new Error(`Experiment "${id}" already exists. Use update() to modify.`);
    }

    const record: ExperimentRecord = {
      experimentId: id,
      config,
      status: 'draft',
      createdAt: new Date().toISOString(),
      gitCommit: getGitCommit(),
      tags: config.tags,
    };

    this.experiments.set(id, record);

    // Update prompt history
    const hist = this.promptHistory.get(config.promptName) ?? [];
    hist.push(record);
    this.promptHistory.set(config.promptName, hist);

    return record;
  }

  /** Update an existing experiment (e.g. attach results) */
  update(experimentId: string, updates: Partial<ExperimentRecord>): ExperimentRecord {
    const existing = this.experiments.get(experimentId);
    if (!existing) {
      throw new Error(`Experiment "${experimentId}" not found`);
    }

    const updated: ExperimentRecord = { ...existing, ...updates };
    this.experiments.set(experimentId, updated);

    // Update in prompt history
    const hist = this.promptHistory.get(existing.config.promptName) ?? [];
    const idx = hist.findIndex(r => r.experimentId === experimentId);
    if (idx !== -1) hist[idx] = updated;
    this.promptHistory.set(existing.config.promptName, hist);

    return updated;
  }

  /** Set experiment status */
  setStatus(experimentId: string, status: ExperimentStatus): void {
    const record = this.experiments.get(experimentId);
    if (!record) throw new Error(`Experiment "${experimentId}" not found`);

    record.status = status;
    if (status === 'running' && !record.startedAt) {
      record.startedAt = new Date().toISOString();
    }
    if (status === 'completed' || status === 'failed') {
      record.completedAt = new Date().toISOString();
    }
  }

  /** Attach results to an experiment */
  attachResult(experimentId: string, result: ExperimentResult): void {
    const record = this.experiments.get(experimentId);
    if (!record) throw new Error(`Experiment "${experimentId}" not found`);

    record.result = result;
    record.status = 'completed';
    record.completedAt = new Date().toISOString();
  }

  // ── Retrieval ──

  /** Get an experiment by ID */
  get(experimentId: string): ExperimentRecord | undefined {
    return this.experiments.get(experimentId);
  }

  /** List all experiments */
  list(): ExperimentRecord[] {
    return [...this.experiments.values()];
  }

  /** List experiments by status */
  listByStatus(status: ExperimentStatus): ExperimentRecord[] {
    return [...this.experiments.values()].filter(e => e.status === status);
  }

  /** Get experiment history for a prompt */
  history(promptName: string): ExperimentRecord[] {
    return this.promptHistory.get(promptName) ?? [];
  }

  /** Get the latest experiment for a prompt */
  latest(promptName: string): ExperimentRecord | undefined {
    const hist = this.promptHistory.get(promptName);
    if (!hist || hist.length === 0) return undefined;
    return hist[hist.length - 1];
  }

  /** Get the latest completed experiment for a prompt */
  latestCompleted(promptName: string): ExperimentRecord | undefined {
    const hist = this.promptHistory.get(promptName);
    if (!hist) return undefined;

    // Return most recent completed
    const completed = hist.filter(e => e.status === 'completed' && e.result);
    return completed.length > 0 ? completed[completed.length - 1] : undefined;
  }

  /** List experiments by tag */
  listByTag(tag: string): ExperimentRecord[] {
    return [...this.experiments.values()].filter(
      e => e.tags?.includes(tag),
    );
  }

  /** Get experiments that include a specific prompt version */
  findByPromptVersion(promptVersion: string): ExperimentRecord[] {
    return [...this.experiments.values()].filter(e =>
      e.config.variants.some(v => v.promptVersion === promptVersion),
    );
  }

  /** Get experiments that tested a specific provider */
  findByProvider(provider: string): ExperimentRecord[] {
    return [...this.experiments.values()].filter(e =>
      e.config.providers.includes(provider),
    );
  }

  /** Count experiments by status */
  countByStatus(): Record<ExperimentStatus, number> {
    const counts: Record<ExperimentStatus, number> = {
      draft: 0,
      running: 0,
      completed: 0,
      failed: 0,
      archived: 0,
    };
    for (const e of this.experiments.values()) {
      counts[e.status]++;
    }
    return counts;
  }

  // ── Query ──

  /** Get all completed experiments with results */
  getCompletedResults(): Array<{ config: ExperimentConfig; result: ExperimentResult }> {
    return [...this.experiments.values()]
      .filter(e => e.status === 'completed' && e.result)
      .map(e => ({ config: e.config, result: e.result! }));
  }

  /** Compare the same prompt across multiple experiments (trend) */
  getTrend(promptName: string): Array<{ experimentId: string; runAt: string; winnerId: string | null; winnerScore: number }> {
    const hist = this.promptHistory.get(promptName) ?? [];
    return hist
      .filter(e => e.status === 'completed' && e.result?.winner)
      .map(e => ({
        experimentId: e.experimentId,
        runAt: e.completedAt ?? e.createdAt,
        winnerId: e.result!.winner?.variantId ?? null,
        winnerScore: e.result!.winner?.breakdown.overall.winner ?? 0,
      }))
      .sort((a, b) => a.runAt.localeCompare(b.runAt));
  }

  // ── Management ──

  /** Archive an experiment */
  archive(experimentId: string): void {
    const record = this.experiments.get(experimentId);
    if (!record) throw new Error(`Experiment "${experimentId}" not found`);
    record.status = 'archived';
  }

  /** Delete an experiment (only draft or archived) */
  delete(experimentId: string): boolean {
    const record = this.experiments.get(experimentId);
    if (!record) return false;
    if (record.status === 'running') {
      throw new Error('Cannot delete a running experiment');
    }
    this.experiments.delete(experimentId);

    // Remove from prompt history
    const hist = this.promptHistory.get(record.config.promptName);
    if (hist) {
      const idx = hist.findIndex(r => r.experimentId === experimentId);
      if (idx !== -1) hist.splice(idx, 1);
    }

    return true;
  }
}

/** Singleton experiment registry */
export const experimentRegistry = new ExperimentRegistry();
