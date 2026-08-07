// ============================================
// Baseline Manager — production, latest, and
// historical baselines for drift comparison.
//
// Maintains multiple baseline snapshots:
//   - Production baseline (golden reference)
//   - Latest baseline (most recent evaluation)
//   - Historical baselines (archived snapshots)
// ============================================

import type { ScoreRecord } from './score-history';
import { scoreHistory } from './score-history';

// ── Types ──

/** Baseline type */
export type BaselineType = 'production' | 'latest' | 'historical';

/** A saved baseline snapshot */
export interface Baseline {
  /** Unique baseline ID */
  id: string;
  /** Baseline type */
  type: BaselineType;
  /** Prompt name this baseline is for */
  promptName: string;
  /** The score record snapshot */
  record: ScoreRecord;
  /** When this baseline was created */
  createdAt: string;
  /** Who or what created it */
  createdBy: string;
  /** Optional label */
  label?: string;
  /** Optional notes */
  notes?: string;
}

// ── Baseline Manager ──

class BaselineManager {
  /** All baselines, keyed by ID */
  private baselines = new Map<string, Baseline>();

  /** Current production baseline per prompt */
  private productionBaselines = new Map<string, Baseline>();

  /** Latest baseline per prompt */
  private latestBaselines = new Map<string, Baseline>();

  /** Historical baselines per prompt */
  private historicalBaselines = new Map<string, Baseline[]>();

  // ── Set Baselines ──

  /**
   * Set the production baseline for a prompt.
   * This is the gold-standard reference for regression detection.
   */
  setProductionBaseline(
    promptName: string,
    record: ScoreRecord,
    createdBy: string = 'manual',
    notes?: string,
  ): Baseline {
    // Archive the current production baseline if it exists
    const current = this.productionBaselines.get(promptName);
    if (current) {
      this.archiveBaseline(current);
    }

    const baseline: Baseline = {
      id: `baseline-${promptName}-production-${Date.now()}`,
      type: 'production',
      promptName,
      record,
      createdAt: new Date().toISOString(),
      createdBy,
      label: 'Production Baseline',
      notes,
    };

    this.baselines.set(baseline.id, baseline);
    this.productionBaselines.set(promptName, baseline);

    return baseline;
  }

  /**
   * Update the latest baseline from the most recent score record.
   */
  updateLatestBaseline(
    promptName: string,
    createdBy: string = 'auto',
  ): Baseline | undefined {
    const latest = scoreHistory.getLatest(promptName);
    if (!latest) return undefined;

    const baseline: Baseline = {
      id: `baseline-${promptName}-latest-${Date.now()}`,
      type: 'latest',
      promptName,
      record: latest,
      createdAt: new Date().toISOString(),
      createdBy,
      label: 'Latest Evaluation',
    };

    this.baselines.set(baseline.id, baseline);
    this.latestBaselines.set(promptName, baseline);

    return baseline;
  }

  /**
   * Save a historical baseline snapshot.
   */
  saveHistoricalBaseline(
    promptName: string,
    record: ScoreRecord,
    label: string,
    notes?: string,
  ): Baseline {
    const baseline: Baseline = {
      id: `baseline-${promptName}-hist-${Date.now()}`,
      type: 'historical',
      promptName,
      record,
      createdAt: new Date().toISOString(),
      createdBy: 'manual',
      label,
      notes,
    };

    this.baselines.set(baseline.id, baseline);

    const hist = this.historicalBaselines.get(promptName) ?? [];
    hist.push(baseline);
    this.historicalBaselines.set(promptName, hist);

    return baseline;
  }

  // ── Get Baselines ──

  /** Get the production baseline for a prompt */
  getProductionBaseline(promptName: string): Baseline | undefined {
    return this.productionBaselines.get(promptName);
  }

  /** Get the latest baseline for a prompt */
  getLatestBaseline(promptName: string): Baseline | undefined {
    return this.latestBaselines.get(promptName);
  }

  /** Get all historical baselines for a prompt */
  getHistoricalBaselines(promptName: string): Baseline[] {
    return this.historicalBaselines.get(promptName) ?? [];
  }

  /** Get a specific baseline by ID */
  getBaseline(id: string): Baseline | undefined {
    return this.baselines.get(id);
  }

  /** Get the best baseline to compare against */
  getComparisonBaseline(promptName: string): Baseline | undefined {
    return this.getProductionBaseline(promptName)
      ?? this.getLatestBaseline(promptName);
  }

  // ── Update & Rollback ──

  /**
   * Update the production baseline from the latest evaluation.
   * Used when quality has improved and we want to reset the baseline.
   */
  updateProductionBaseline(
    promptName: string,
    notes?: string,
  ): Baseline | undefined {
    const latest = scoreHistory.getLatest(promptName);
    if (!latest) return undefined;
    return this.setProductionBaseline(promptName, latest, 'auto-update', notes);
  }

  /**
   * Rollback the production baseline to a historical baseline.
   */
  rollbackBaseline(
    promptName: string,
    historicalBaselineId: string,
  ): Baseline | undefined {
    const historical = this.baselines.get(historicalBaselineId);
    if (!historical || historical.promptName !== promptName) return undefined;

    return this.setProductionBaseline(
      promptName,
      historical.record,
      'rollback',
      `Rolled back to: ${historical.label ?? historical.id}`,
    );
  }

  /**
   * Compare current evaluation against the production baseline.
   */
  compareToBaseline(promptName: string): {
    hasBaseline: boolean;
    current?: ScoreRecord;
    baseline?: ScoreRecord;
    delta?: number;
  } {
    const baseline = this.getProductionBaseline(promptName);
    const current = scoreHistory.getLatest(promptName);

    if (!baseline || !current) {
      return { hasBaseline: false };
    }

    return {
      hasBaseline: true,
      current: current,
      baseline: baseline.record,
      delta: current.overallScore - baseline.record.overallScore,
    };
  }

  // ── List ──

  /** List all baselines for a prompt */
  listBaselines(promptName: string): Baseline[] {
    const result: Baseline[] = [];

    const prod = this.productionBaselines.get(promptName);
    if (prod) result.push(prod);

    const latest = this.latestBaselines.get(promptName);
    if (latest && latest.id !== prod?.id) result.push(latest);

    const hist = this.historicalBaselines.get(promptName) ?? [];
    result.push(...hist);

    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** List all prompts that have baselines */
  listMonitoredPrompts(): string[] {
    const prompts = new Set<string>();
    for (const p of this.productionBaselines.keys()) prompts.add(p);
    for (const p of this.latestBaselines.keys()) prompts.add(p);
    return [...prompts];
  }

  /** Count total baselines */
  count(): number {
    return this.baselines.size;
  }

  // ── Archive ──

  private archiveBaseline(baseline: Baseline): void {
    const archived: Baseline = {
      ...baseline,
      id: baseline.id.replace('production', `hist-${Date.now()}`),
      type: 'historical',
      label: `Archived: ${baseline.label ?? 'Production Baseline'}`,
    };

    this.baselines.set(archived.id, archived);

    const hist = this.historicalBaselines.get(baseline.promptName) ?? [];
    hist.push(archived);
    this.historicalBaselines.set(baseline.promptName, hist);
  }

  /** Clear all baselines */
  clear(): void {
    this.baselines.clear();
    this.productionBaselines.clear();
    this.latestBaselines.clear();
    this.historicalBaselines.clear();
  }
}

/** Singleton baseline manager */
export const baselineManager = new BaselineManager();
