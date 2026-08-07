// ============================================
// EvaluationRecord — Durable evaluation lifecycle
// state for crash recovery.
//
// Tracks the complete lifecycle of ONE logical
// evaluation so that side effects can be replayed
// after a process restart without duplication.
// ============================================

import type { ScoreRecord } from './score-history';

// ── Types ──

/** Terminal evaluation status */
export type EvaluationStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'aborted';

/** Per-side-effect completion flags for granular recovery */
export interface SideEffectFlags {
  historyWritten: boolean;
  baselineWritten: boolean;
  metricsWritten: boolean;
  terminalEventEmitted: boolean;
}

/** All side-effect keys for iteration */
export const SIDE_EFFECT_KEYS: (keyof SideEffectFlags)[] = [
  'historyWritten',
  'baselineWritten',
  'metricsWritten',
  'terminalEventEmitted',
];

/** Persistent evaluation lifecycle record */
export interface EvaluationRecord {
  /** Unique evaluation ID (matches ScoreRecord.id) */
  evaluationId: string;
  /** Prompt name */
  promptName: string;
  /** Dataset ID */
  datasetId: string;
  /** Monitor generation when created */
  generation: number;
  /** Trigger type */
  triggerType: string;

  /** Current lifecycle status */
  status: EvaluationStatus;

  /** Epoch ms when evaluation started */
  startedAt: number;
  /** Epoch ms when finalization completed (if applicable) */
  finalizedAt?: number;

  /** Score record (populated on completion) */
  result?: ScoreRecord;

  /** Error metadata (populated on failure/timeout/abort) */
  error?: {
    code: string;
    message: string;
  };

  /** Individual side-effect completion tracking */
  sideEffects: SideEffectFlags;
}

// ── Recovery Report ──

/** Result of running crash recovery */
export interface RecoveryReport {
  /** Total evaluations examined */
  attempted: number;
  /** Successfully recovered */
  recovered: number;
  /** Marked as aborted (no way to resume) */
  aborted: number;
  /** Recovery attempt failed */
  failed: number;

  /** Total side effects replayed across all evaluations */
  replayedSideEffects: number;

  /** Per-evaluation details */
  evaluations: RecoveryReportEntry[];
}

export interface RecoveryReportEntry {
  evaluationId: string;
  promptName: string;
  previousStatus: string;
  finalStatus: string;
  sideEffectsReplayed: string[];
  error?: string;
}

// ── Helpers ──

/** Create an empty side-effect flags object */
export function emptySideEffects(): SideEffectFlags {
  return {
    historyWritten: false,
    baselineWritten: false,
    metricsWritten: false,
    terminalEventEmitted: false,
  };
}

/** Create a new pending EvaluationRecord */
export function createEvaluationRecord(
  evaluationId: string,
  promptName: string,
  datasetId: string,
  generation: number,
  triggerType: string,
): EvaluationRecord {
  return {
    evaluationId,
    promptName,
    datasetId,
    generation,
    triggerType,
    status: 'pending',
    startedAt: Date.now(),
    sideEffects: emptySideEffects(),
  };
}

/** Create an empty RecoveryReport */
export function emptyRecoveryReport(): RecoveryReport {
  return {
    attempted: 0,
    recovered: 0,
    aborted: 0,
    failed: 0,
    replayedSideEffects: 0,
    evaluations: [],
  };
}

// ── State Machine ──

/** Legal transitions: pending → terminal state. Terminal → nowhere. */
const VALID_TRANSITIONS: Record<EvaluationStatus, EvaluationStatus[]> = {
  pending: ['completed', 'failed', 'timed_out', 'aborted'],
  completed: [],
  failed: [],
  timed_out: [],
  aborted: [],
};

/** Terminal statuses that must never transition again */
const TERMINAL_STATUSES: Set<EvaluationStatus> = new Set([
  'completed', 'failed', 'timed_out', 'aborted',
]);

/** Check if a status is terminal (cannot transition further) */
export function isTerminalStatus(status: EvaluationStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Check if a transition from one status to another is valid.
 * Terminal statuses cannot transition to anything.
 */
export function canTransition(from: EvaluationStatus, to: EvaluationStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/** Get the valid target statuses for a given status */
export function validTransitions(from: EvaluationStatus): EvaluationStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}
