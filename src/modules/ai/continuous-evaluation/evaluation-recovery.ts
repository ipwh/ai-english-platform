// ============================================
// Evaluation Recovery — Crash recovery for
// durable evaluation lifecycle.
//
// On process restart, inspects persisted
// EvaluationRecords and replays incomplete
// side effects without duplication.
// ============================================

import type {
  EvaluationRecord,
  RecoveryReport,
  RecoveryReportEntry,
  SideEffectFlags,
} from './evaluation-record';
import { emptyRecoveryReport, SIDE_EFFECT_KEYS } from './evaluation-record';
import type { EvaluationStore } from './evaluation-store';
import { scoreHistory } from './score-history';
import { baselineManager } from './baseline-manager';
import { incSuccessCounterDedup, incFailureCounterDedup } from './evaluator';
import type { EventBus } from '../foundation';
import type { ContinuousEvalCompletedEvent, ContinuousEvalFailedEvent, ContinuousEvalTimedOutEvent, ContinuousEvalAbortedEvent } from '../foundation';

// ── Event emission helpers for recovery ──

function emitCompletedForRecovery(events: EventBus, rec: EvaluationRecord): void {
  if (!rec.result) return;
  try {
    events.emit({
      type: 'continuous-eval:completed',
      evaluationId: rec.evaluationId,
      promptName: rec.promptName,
      datasetId: rec.datasetId,
      triggerType: rec.triggerType,
      overallScore: rec.result.overallScore,
      provider: rec.result.provider,
      model: rec.result.model,
      latencyMs: rec.result.latencyMs,
      timestamp: new Date().toISOString(),
    } as ContinuousEvalCompletedEvent);
  } catch { /* event emission must never fail recovery */ }
}

function emitFailedForRecovery(events: EventBus, rec: EvaluationRecord): void {
  if (!rec.result) return;
  const errorMsg = rec.result.errorMessage ?? '';
  try {
    if (errorMsg.includes('timed out') || errorMsg.includes('TimeoutError')) {
      events.emit({
        type: 'continuous-eval:timedOut',
        evaluationId: rec.evaluationId,
        promptName: rec.promptName,
        datasetId: rec.datasetId,
        triggerType: rec.triggerType,
        timestamp: new Date().toISOString(),
      } as ContinuousEvalTimedOutEvent);
    } else if (errorMsg.includes('abort')) {
      events.emit({
        type: 'continuous-eval:aborted',
        evaluationId: rec.evaluationId,
        promptName: rec.promptName,
        datasetId: rec.datasetId,
        triggerType: rec.triggerType,
        timestamp: new Date().toISOString(),
      } as ContinuousEvalAbortedEvent);
    } else {
      events.emit({
        type: 'continuous-eval:failed',
        evaluationId: rec.evaluationId,
        promptName: rec.promptName,
        datasetId: rec.datasetId,
        triggerType: rec.triggerType,
        errorCode: 'PROVIDER_ERROR',
        errorMessage: errorMsg || 'Unknown error',
        timestamp: new Date().toISOString(),
      } as ContinuousEvalFailedEvent);
    }
  } catch { /* event emission must never fail recovery */ }
}

// ── Side-Effect Replay ──

type SideEffectApplier = (record: EvaluationRecord) => Promise<void>;
type SideEffectName = keyof SideEffectFlags;

/**
 * Build the ordered list of side-effect replays.
 * Order: history → baseline → metrics → terminal event
 */
function buildReplaySteps(
  events: EventBus,
): Array<{ name: SideEffectName; apply: SideEffectApplier }> {
  return [
    {
      name: 'historyWritten',
      apply: async (rec) => {
        if (rec.result && rec.result.success) {
          const existing = scoreHistory.getByPrompt(rec.promptName);
          const alreadyExists = existing.some(r => r.id === rec.evaluationId);
          if (!alreadyExists) {
            scoreHistory.add(rec.result);
          }
        }
      },
    },
    {
      name: 'baselineWritten',
      apply: async (rec) => {
        if (rec.result && rec.result.success) {
          baselineManager.updateLatestBaseline(rec.promptName, rec.triggerType);
        }
      },
    },
    {
      name: 'metricsWritten',
      apply: async (rec) => {
        if (rec.result) {
          if (rec.result.success) {
            incSuccessCounterDedup(rec.evaluationId);
          } else {
            const errorMsg = (rec.result.errorMessage ?? '').toLowerCase();
            if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
              incFailureCounterDedup(rec.evaluationId, 'PROVIDER_TIMEOUT');
            } else if (errorMsg.includes('abort')) {
              incFailureCounterDedup(rec.evaluationId, 'PROVIDER_ABORTED');
            } else if (errorMsg.includes('dataset') || errorMsg.includes('fixture')) {
              incFailureCounterDedup(rec.evaluationId, 'DATASET_ERROR');
            } else if (errorMsg.includes('score') || errorMsg.includes('nan') || errorMsg.includes('infinity')) {
              incFailureCounterDedup(rec.evaluationId, 'SCORING_ERROR');
            } else {
              incFailureCounterDedup(rec.evaluationId, 'PROVIDER_ERROR');
            }
          }
        }
      },
    },
    {
      name: 'terminalEventEmitted',
      apply: async (rec) => {
        if (rec.result) {
          if (rec.result.success) {
            emitCompletedForRecovery(events, rec);
          } else {
            emitFailedForRecovery(events, rec);
          }
        }
      },
    },
  ];
}

// ── Recovery ──

/** In-process lock to prevent concurrent recovery runs */
let recoveryInProgress = false;

/**
 * Recover pending and partially-finalized evaluations after a restart.
 *
 * Algorithm:
 *   1. Find all non-pending evaluations with incomplete side effects
 *   2. For each, replay missing side effects in deterministic order
 *   3. Mark each side effect as complete after successful replay
 *   4. Mark pending evaluations (no result) as aborted — ONLY if from a
 *      stale generation. Current-generation pending records may still be
 *      in-flight and should not be aborted.
 *
 * Idempotent — calling recover() multiple times produces the same final state.
 * Serialized — concurrent calls are rejected (only one recovery at a time).
 */
export async function recoverPendingEvaluations(
  store: EvaluationStore,
  events: EventBus,
  options: { dryRun?: boolean; currentGeneration?: number } = {},
): Promise<RecoveryReport> {
  // Prevent concurrent recovery
  if (recoveryInProgress) {
    const report = emptyRecoveryReport();
    report.evaluations.push({
      evaluationId: 'recovery-locked',
      promptName: '',
      previousStatus: '',
      finalStatus: '',
      sideEffectsReplayed: [],
      error: 'Recovery already in progress',
    });
    return report;
  }
  recoveryInProgress = true;

  try {
    return await doRecover(store, events, options);
  } finally {
    recoveryInProgress = false;
  }
}

async function doRecover(
  store: EvaluationStore,
  events: EventBus,
  options: { dryRun?: boolean; currentGeneration?: number },
): Promise<RecoveryReport> {
  const report = emptyRecoveryReport();
  const steps = buildReplaySteps(events);

  // 1. Find pending evaluations with results (partially finalized before crash)
  const finalized = await store.listFinalized();
  const pendingWithResult = finalized.filter(
    r => r.result && !allSideEffectsComplete(r.sideEffects),
  );

  // 2. Find pure-pending evaluations (no result — interrupted during provider call)
  //    Only abort pending records from STALE generations. Current-generation
  //    pending records may still be in-flight.
  const allPending = await store.listByStatus('pending');
  const purePending = options.currentGeneration !== undefined
    ? allPending.filter(r => r.generation < options.currentGeneration!)
    : allPending;

  report.attempted = pendingWithResult.length + purePending.length;

  // 3. Recover partially-finalized evaluations
  for (const rec of pendingWithResult) {
    const entry: RecoveryReportEntry = {
      evaluationId: rec.evaluationId,
      promptName: rec.promptName,
      previousStatus: rec.status,
      finalStatus: rec.status,
      sideEffectsReplayed: [],
    };

    try {
      const replayed: SideEffectName[] = [];

      for (const step of steps) {
        if (!rec.sideEffects[step.name]) {
          if (!options.dryRun) {
            try {
              await step.apply(rec);
            } catch (err) {
              // Side-effect replay failed — do NOT mark as complete
              entry.error = `Failed to replay ${step.name}: ${err instanceof Error ? err.message : String(err)}`;
              report.failed++;
              break; // Stop further replays for this evaluation
            }
          }
          replayed.push(step.name);
        }
      }

      // Mark replayed side effects as complete
      if (!options.dryRun && replayed.length > 0) {
        const updatedFlags: Partial<SideEffectFlags> = {};
        for (const key of replayed) {
          updatedFlags[key as keyof SideEffectFlags] = true;
        }
        await store.update(rec.evaluationId, {
          sideEffects: { ...rec.sideEffects, ...updatedFlags },
        });
      }

      entry.sideEffectsReplayed = replayed;
      entry.finalStatus = rec.status;
      report.recovered++;
      report.replayedSideEffects += replayed.length;
    } catch (err) {
      entry.error = `Recovery failed: ${err instanceof Error ? err.message : String(err)}`;
      report.failed++;
    }

    report.evaluations.push(entry);
  }

  // 4. Abort pure-pending evaluations (no result to replay)
  for (const rec of purePending) {
    const entry: RecoveryReportEntry = {
      evaluationId: rec.evaluationId,
      promptName: rec.promptName,
      previousStatus: 'pending',
      finalStatus: 'aborted',
      sideEffectsReplayed: [],
      error: 'EVALUATION_INTERRUPTED',
    };

    if (!options.dryRun) {
      await store.update(rec.evaluationId, {
        status: 'aborted',
        finalizedAt: Date.now(),
        error: { code: 'EVALUATION_INTERRUPTED', message: 'Process restarted during evaluation' },
      });
    }

    report.aborted++;
    report.evaluations.push(entry);
  }

  return report;
}

/** Check if all side effects have been marked complete */
function allSideEffectsComplete(flags: SideEffectFlags): boolean {
  return SIDE_EFFECT_KEYS.every(k => flags[k]);
}
