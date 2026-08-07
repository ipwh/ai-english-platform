// ============================================
// Score History — persistent time-series storage
// for prompt evaluation scores.
//
// Maintains rolling history with configurable
// retention. Supports querying by time window
// for trend analysis.
// ============================================

import type { DriftThresholds } from './config';
import type { DriftSeverity } from './config';

// ── Types ──

/** A single evaluation record in the history */
export interface ScoreRecord {
  /** Unique record ID */
  id: string;
  /** Prompt being evaluated (name@version) */
  promptId: string;
  /** Prompt name */
  promptName: string;
  /** Timestamp of evaluation */
  timestamp: string;

  // Scores
  overallScore: number;
  rubricScore: number;
  semanticScore: number;
  structuralScore: number;

  // Performance
  latencyMs: number;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;

  // Reliability
  jsonRepairCount: number;
  retryCount: number;
  provider: string;
  model: string;
  success: boolean;
  errorMessage?: string;

  // Context
  triggerType: string; // 'daily' | 'onRelease' | 'manual' etc.
  gitCommit: string;
  datasetId: string;
}

/** Summary statistics for a time window */
export interface ScoreSummary {
  promptName: string;
  window: { start: string; end: string };
  recordCount: number;

  meanOverall: number;
  medianOverall: number;
  minOverall: number;
  maxOverall: number;
  stdDevOverall: number;

  meanLatency: number;
  meanCost: number;
  successRate: number;
}

// ── Score History Store ──

class ScoreHistoryStore {
  /** All score records, indexed by ID */
  private records = new Map<string, ScoreRecord>();

  /** Records grouped by prompt name for fast query */
  private byPrompt = new Map<string, ScoreRecord[]>();

  /** Maximum entries to retain */
  private maxEntries = 1000;

  // ── Write ──

  /** Add a score record */
  add(record: ScoreRecord): void {
    this.records.set(record.id, record);

    const promptRecords = this.byPrompt.get(record.promptName) ?? [];
    promptRecords.push(record);
    // Keep sorted by timestamp descending
    promptRecords.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    this.byPrompt.set(record.promptName, promptRecords);

    // Enforce max entries
    this.enforceRetention();
  }

  /** Add multiple records at once */
  addBatch(records: ScoreRecord[]): void {
    for (const r of records) this.add(r);
  }

  // ── Query ──

  /** Get all records for a prompt (defensive copies) */
  getByPrompt(promptName: string): ScoreRecord[] {
    return (this.byPrompt.get(promptName) ?? []).map(r => structuredClone(r));
  }

  /** Get records in a time window (defensive copies) */
  getByWindow(
    promptName: string,
    startDate: Date,
    endDate: Date = new Date(),
  ): ScoreRecord[] {
    const records = this.byPrompt.get(promptName) ?? [];
    return records
      .filter(r => {
        const ts = new Date(r.timestamp);
        return ts >= startDate && ts <= endDate;
      })
      .map(r => structuredClone(r));
  }

  /** Get the N most recent records for a prompt (defensive copies) */
  getRecent(promptName: string, n: number = 10): ScoreRecord[] {
    const records = this.byPrompt.get(promptName) ?? [];
    return records.slice(0, n).map(r => structuredClone(r));
  }

  /** Get the most recent record for a prompt (defensive copy) */
  getLatest(promptName: string): ScoreRecord | undefined {
    const records = this.byPrompt.get(promptName);
    if (!records || records.length === 0) return undefined;
    return structuredClone(records[0]); // Sorted newest first
  }

  /** Get summary for a window */
  getSummary(promptName: string, startDate: Date, endDate: Date = new Date()): ScoreSummary {
    const records = this.getByWindow(promptName, startDate, endDate);
    const successful = records.filter(r => r.success);

    if (successful.length === 0) {
      return {
        promptName,
        window: { start: startDate.toISOString(), end: endDate.toISOString() },
        recordCount: 0,
        meanOverall: 0, medianOverall: 0, minOverall: 0, maxOverall: 0, stdDevOverall: 0,
        meanLatency: 0, meanCost: 0, successRate: 0,
      };
    }

    const scores = successful.map(r => r.overallScore).sort((a, b) => a - b);
    const mid = Math.floor(scores.length / 2);

    return {
      promptName,
      window: { start: startDate.toISOString(), end: endDate.toISOString() },
      recordCount: successful.length,
      meanOverall: scores.reduce((s, v) => s + v, 0) / scores.length,
      medianOverall: scores.length % 2 === 0 ? (scores[mid - 1] + scores[mid]) / 2 : scores[mid],
      minOverall: scores[0],
      maxOverall: scores[scores.length - 1],
      stdDevOverall: computeStdDev(scores),
      meanLatency: successful.reduce((s, r) => s + r.latencyMs, 0) / successful.length,
      meanCost: successful.reduce((s, r) => s + r.costUsd, 0) / successful.length,
      successRate: records.length > 0 ? successful.length / records.length : 0,
    };
  }

  /** Get all unique prompt names */
  getAllPromptNames(): string[] {
    return [...this.byPrompt.keys()];
  }

  /** Count total records */
  count(): number {
    return this.records.size;
  }

  // ── Retention ──

  setMaxEntries(max: number): void {
    this.maxEntries = max;
    this.enforceRetention();
  }

  private enforceRetention(): void {
    if (this.records.size <= this.maxEntries) return;

    // Remove oldest entries
    const sorted = [...this.records.values()]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const toRemove = sorted.slice(0, this.records.size - this.maxEntries);
    for (const record of toRemove) {
      this.records.delete(record.id);
      const promptRecords = this.byPrompt.get(record.promptName);
      if (promptRecords) {
        const idx = promptRecords.findIndex(r => r.id === record.id);
        if (idx !== -1) promptRecords.splice(idx, 1);
      }
    }
  }

  /** Clear all records */
  clear(): void {
    this.records.clear();
    this.byPrompt.clear();
  }
}

// ── Helpers ──

function computeStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sqDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((s, v) => s + v, 0) / (values.length - 1));
}

/** Singleton score history store */
export const scoreHistory = new ScoreHistoryStore();
