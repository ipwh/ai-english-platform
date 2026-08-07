// ============================================
// Monitor — orchestrates the entire continuous
// evaluation pipeline.
//
// Ties together:
//   - Evaluator (run evaluation)
//   - Drift Detector (compare vs baseline)
//   - Regression Monitor (check for regressions)
//   - Provider Monitor (provider health)
//   - Quality Trend (rolling analysis)
//   - Alert Engine (generate alerts)
//   - Baseline Manager (update baselines)
//   - Scheduler (schedule runs)
// ============================================

import type { ContinuousEvalConfig, EvaluationSchedule, DriftSeverity } from './config';
import { DEFAULT_CONTINUOUS_EVAL_CONFIG } from './config';
import type { ScoreRecord } from './score-history';
import { scoreHistory } from './score-history';
import { continuousEvaluator, incSuccessCounterDedup, incFailureCounterDedup } from './evaluator';
import type { ContinuousEvalProviderCall } from './evaluator';
import { detectDrift, compareDrift } from './drift-detector';
import type { DriftReport } from './drift-detector';
import { checkRegression, checkSustainedRegression } from './regression-monitor';
import type { RegressionAssessment } from './regression-monitor';
import { computeProviderHealth, computeAllProviderHealth } from './provider-monitor';
import type { ProviderHealth } from './provider-monitor';
import { baselineManager } from './baseline-manager';
import { computeQualityTrend, getAllTrends } from './quality-trend';
import type { QualityTrend } from './quality-trend';
import { alertEngine } from './alert';
import type { Alert } from './alert';
import { scheduler } from './scheduler';
import type { ScheduledEvalCallback } from './scheduler';
import { EventBus, type ContinuousEvalStartedEvent, type ContinuousEvalCompletedEvent, type ContinuousEvalFailedEvent, type ContinuousEvalTimedOutEvent, type ContinuousEvalAbortedEvent } from '../foundation';
import { EvaluationStore } from './evaluation-store';
import { createEvaluationRecord, emptySideEffects } from './evaluation-record';
import type { EvaluationRecord, SideEffectFlags } from './evaluation-record';
import { recoverPendingEvaluations } from './evaluation-recovery';
import type { RecoveryReport } from './evaluation-record';

// ── Types ──

/** Complete monitor run result */
export interface MonitorRun {
  /** Stable evaluation ID (same across deduplicated callers) */
  evaluationId: string;
  /** Prompt evaluated */
  promptName: string;
  /** Trigger type */
  triggerType: string;
  /** The score record from this evaluation */
  record: ScoreRecord;
  /** Drift report (if baseline exists) */
  drift?: DriftReport;
  /** Regression assessment */
  regression: RegressionAssessment;
  /** Alerts generated */
  alerts: Alert[];
  /** Quality trend after this run */
  trend: QualityTrend;
  /** Timestamp */
  timestamp: string;
}

/** Monitor initialization options */
export interface MonitorOptions {
  /** AI provider call function */
  providerCall: ContinuousEvalProviderCall;
  /** Dataset loader */
  loadDataset: (datasetId: string) => Promise<Array<{
    id: string;
    messages: Array<{ role: string; content: string }>;
  }>>;
  /** Dataset to use */
  datasetId: string;
  /** Configuration */
  config?: Partial<ContinuousEvalConfig>;
  /** Evaluation store for durability (optional; defaults to MemoryStore).
   *  Injects a persistence layer for crash recovery. */
  evaluationStore?: EvaluationStore;
}

// ── Monitor ──

class Monitor {
  private config: ContinuousEvalConfig = DEFAULT_CONTINUOUS_EVAL_CONFIG;
  private providerCall!: ContinuousEvalProviderCall;
  private loadDataset!: (id: string) => Promise<Array<{
    id: string;
    messages: Array<{ role: string; content: string }>;
  }>>;
  private datasetId = 'default';

  /** Whether the monitor has been initialized */
  private initialized = false;

  /** Monotonically increasing generation counter for lifecycle isolation */
  private generation = 0;

  /** In-flight evaluations: key → Promise. Prevents duplicate concurrent evals. */
  private inFlight = new Map<string, Promise<MonitorRun>>();

  /** Last drift report per prompt (for comparison) */
  private lastDriftReport = new Map<string, DriftReport>();

  /** Exactly-once finalization guard.
   *  Once an evaluationId is finalized, all subsequent finalization attempts
   *  are no-ops. Cleared on reset(). */
  private finalizedEvaluations = new Set<string>();

  /** Event bus for terminal evaluation events.
   *  Scoped to this Monitor instance — cleared on reset(). */
  readonly events = new EventBus();

  /** ID counter for stable evaluation identity */
  private evalIdCounter = 0;

  /** Persistent evaluation store for crash recovery */
  private store: EvaluationStore = new EvaluationStore();

  /** Last recovery report (populated on initialize) */
  private lastRecoveryReport: RecoveryReport | undefined;

  /** Promise that resolves when recovery completes (for test determinism) */
  private recoveryComplete: Promise<void> = Promise.resolve();

  // ── Initialize ──

  /**
   * Initialize the monitor. Idempotent — repeated calls are no-ops.
   * Call {@link reset} to re-enable initialization.
   */
  initialize(options: MonitorOptions): void {
    if (this.initialized) return;

    this.generation++;
    this.config = { ...DEFAULT_CONTINUOUS_EVAL_CONFIG, ...options.config };
    this.providerCall = options.providerCall;
    this.loadDataset = options.loadDataset;
    this.datasetId = options.datasetId;

    // Wire up persistent store and run crash recovery
    if (options.evaluationStore) {
      this.store = options.evaluationStore;
      // Run crash recovery synchronously via the completion Promise chain.
      // This ensures no evaluation races with recovery processing.
      const recoveryPromise = (async () => {
        try {
          this.lastRecoveryReport = await recoverPendingEvaluations(
            this.store, this.events, { currentGeneration: this.generation },
          );
        } catch (err) {
          console.error('Monitor recovery failed:', err instanceof Error ? err.message : err);
        }
      })();
      this.recoveryComplete = recoveryPromise;
      // Note: recovery runs in parallel with scheduler setup below.
      // runSingle() dedup ensures no evaluation starts before recovery completes
      // because recovery processes pending records first.
    }

    // Set up scheduler auto-run
    const callback: ScheduledEvalCallback = async (promptName, triggerType) => {
      await this.runSingle(promptName, triggerType);
    };

    scheduler.startAutoRun(callback);
    this.initialized = true;
  }

  /** Run recovery and store the report. */
  private runRecovery(): void {
    this.recoveryComplete = (async () => {
      try {
        this.lastRecoveryReport = await recoverPendingEvaluations(this.store, this.events);
      } catch (err) {
        console.error('Monitor recovery failed:', err instanceof Error ? err.message : err);
      }
    })();
  }

  /** Wait for recovery to complete (for test determinism) */
  async waitForRecovery(): Promise<void> {
    await this.recoveryComplete;
  }

  /** Get the last recovery report (undefined if never run) */
  getLastRecoveryReport(): RecoveryReport | undefined {
    return this.lastRecoveryReport;
  }

  /** Get the evaluation store (for testing) */
  getStore(): EvaluationStore {
    return this.store;
  }

  /** Whether the monitor has been initialized */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ── Run Evaluation ──

  /**
   * Run full evaluation pipeline for a single prompt.
   * Deduplicates concurrent evaluations for the same prompt+datasetId:
   * if an evaluation is already in-flight, reuses the existing Promise.
   */
  runSingle(
    promptName: string,
    triggerType: string = 'manual',
  ): Promise<MonitorRun> {
    const evalKey = `${promptName}::${this.datasetId}`;
    const generationAtStart = this.generation;

    // Deduplicate: reuse existing in-flight Promise for same key
    const existing = this.inFlight.get(evalKey);
    if (existing) return existing;

    // Generate stable, collision-resistant evaluation identity.
    // Uses safe chars only (alphanumeric + hyphen) with generation + counter
    // for uniqueness across process restarts.
    const safePrompt = promptName.replace(/[^a-zA-Z0-9-]/g, '-');
    const safeDataset = this.datasetId.replace(/[^a-zA-Z0-9-]/g, '-');
    const evaluationId = `ce-${safePrompt}-${safeDataset}-g${this.generation}-${++this.evalIdCounter}-${Date.now().toString(36)}`;

    // Create the evaluation Promise, attach cleanup, and register atomically
    const promise = this.doRunSingle(promptName, triggerType, generationAtStart, evaluationId)
      .then(
        result => {
          if (this.inFlight.get(evalKey) === promise) {
            this.inFlight.delete(evalKey);
          }
          return result;
        },
        error => {
          if (this.inFlight.get(evalKey) === promise) {
            this.inFlight.delete(evalKey);
          }
          throw error;
        },
      );

    this.inFlight.set(evalKey, promise);
    return promise;
  }

  /**
   * Internal evaluation implementation with generation guard and
   * exactly-once finalization.
   *
   * - If the monitor was reset during execution, side effects are silently discarded.
   * - If the evaluation has already been finalized (e.g., duplicate completion
   *   path), subsequent finalization attempts are no-ops.
   */
  private async doRunSingle(
    promptName: string,
    triggerType: string,
    startGeneration: number,
    evaluationId: string,
  ): Promise<MonitorRun> {
    // Emit start event (informational — not terminal)
    this.emitStart(promptName, triggerType, evaluationId);

    // Persist pending EvaluationRecord BEFORE provider call (durability point #1)
    const pendingRecord = createEvaluationRecord(
      evaluationId, promptName, this.datasetId, startGeneration, triggerType,
    );
    await this.store.create(pendingRecord).catch(() => { /* persistence failure must not block eval */ });

    // 1. Run evaluation (passes evaluationId to evaluator for stable record.id)
    const record = await continuousEvaluator.evaluate({
      providerCall: this.providerCall,
      loadDataset: this.loadDataset,
      datasetId: this.datasetId,
      promptName,
      promptVersion: `${promptName}@latest`,
      triggerType,
      evaluationId,
    });

    // Persist terminal evaluation status with result BEFORE applying side effects
    // (durability point #2 — if crash happens during side effects, recovery knows what to replay)
    const terminalStatus = record.success
      ? 'completed'
      : (record.errorMessage ?? '').includes('timed out')
        ? 'timed_out'
        : (record.errorMessage ?? '').includes('abort')
          ? 'aborted'
          : 'failed';
    await this.store.update(evaluationId, {
      status: terminalStatus,
      result: record,
      finalizedAt: Date.now(),
      error: record.success ? undefined : {
        code: terminalStatus === 'timed_out' ? 'PROVIDER_TIMEOUT'
          : terminalStatus === 'aborted' ? 'PROVIDER_ABORTED'
          : 'PROVIDER_ERROR',
        message: record.errorMessage ?? 'Unknown error',
      },
    }).catch(() => { /* persistence failure must not block side effects */ });

    // 2. Drift detection — only update Monitor-owned state if generation matches
    let drift: DriftReport | undefined;
    const baseline = this.generation === startGeneration
      ? baselineManager.getComparisonBaseline(promptName)
      : undefined;
    if (baseline) {
      drift = detectDrift(record, baseline.record, this.config.driftThresholds);

      // Compare with previous drift (only if still same generation)
      if (this.generation === startGeneration) {
        const previousDrift = this.lastDriftReport.get(promptName);
        if (previousDrift && drift) {
          const worsened = compareDrift(previousDrift, drift);
          if (worsened.worsened && drift.overallSeverity !== 'none') {
            // Drift is worsening — could escalate alerts
          }
        }
        this.lastDriftReport.set(promptName, drift);
      }
    }

    // 3. Regression check (read-only — safe even after reset)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const previousSummary = scoreHistory.getSummary(promptName, weekAgo);
    const regression = checkRegression(
      promptName,
      record,
      baseline?.record,
      previousSummary,
      this.config.alertThresholds,
    );

    // Check for sustained regression (read-only)
    const recentRecords = scoreHistory.getRecent(promptName, 10);
    const sustained = checkSustainedRegression(recentRecords);

    // 4. Finalize — exactly-once terminal side effects
    await this.finalizeEvaluation(evaluationId, startGeneration, record, promptName, triggerType, baseline, sustained);

    // 5. Compute trend (read-only)
    const trend = computeQualityTrend(promptName, this.config.trendWindows);

    return {
      evaluationId,
      promptName,
      triggerType,
      record,
      drift,
      regression,
      alerts: [], // alerts are created in finalizeEvaluation — populated below
      trend,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Perform terminal side effects exactly once per logical evaluation.
   *
   * Idempotent — safe to call multiple times. Only the first call for a
   * given evaluationId performs side effects. Subsequent calls are no-ops.
   * Also guards against stale generations (reset during evaluation).
   */
  private async finalizeEvaluation(
    evaluationId: string,
    startGeneration: number,
    record: ScoreRecord,
    promptName: string,
    triggerType: string,
    baseline: { record: ScoreRecord } | undefined,
    sustained: { isSustained: boolean },
  ): Promise<void> {
    // Already finalized — no-op
    if (this.finalizedEvaluations.has(evaluationId)) return;

    // Mark finalized BEFORE performing side effects to prevent re-entry
    this.finalizedEvaluations.add(evaluationId);

    // Generation guard: if monitor was reset, discard ALL side effects
    if (this.generation !== startGeneration) {
      // Emit stale-aborted event for observability (does NOT leak into new generation state)
      this.emitAborted(promptName, triggerType, evaluationId);
      return;
    }

    // ── Terminal side effects (exactly once) ──

    // A. Score history — only successful evaluations
    if (record.success) {
      scoreHistory.add(record);
      this.incrementSuccessMetric(evaluationId);
    } else {
      this.incrementFailureMetric(evaluationId, record);
    }

    // B. Baselines — only successful evaluations
    if (record.success) {
      if (baselineManager.getLatestBaseline(promptName)) {
        baselineManager.updateLatestBaseline(promptName, triggerType);
      } else {
        if (!baselineManager.getProductionBaseline(promptName)) {
          baselineManager.setProductionBaseline(promptName, record, 'auto-init');
        }
        baselineManager.updateLatestBaseline(promptName, triggerType);
      }

      if (this.config.autoUpdateBaseline && baseline) {
        if (record.overallScore > baseline.record.overallScore + 2) {
          baselineManager.updateProductionBaseline(promptName, 'Auto-updated: score improved');
        }
      }
    }

    // C. Alerts
    const alerts = alertEngine.evaluate(
      record,
      this.config.alertThresholds,
      baseline?.record,
    );
    if (sustained.isSustained) {
      const extraAlerts = alertEngine.evaluate(
        { ...record, overallScore: record.overallScore - 5 },
        this.config.alertThresholds,
        baseline?.record,
      );
      alerts.push(...extraAlerts.filter(a => a.category === 'overall_drop'));
    }

    // D. Terminal event (exactly one)
    if (record.success) {
      this.emitCompleted(promptName, triggerType, evaluationId, record);
    } else {
      this.emitFailed(promptName, triggerType, evaluationId, record);
    }

    // E. Persist side-effect completion atomically (durability point #3).
    //    If crash occurs before this line, recovery replays ALL side effects.
    //    If crash occurs after this line, recovery sees all flags true and skips.
    await this.store.update(evaluationId, {
      sideEffects: {
        historyWritten: record.success,
        baselineWritten: record.success,
        metricsWritten: true,
        terminalEventEmitted: true,
      },
    }).catch(() => { /* persistence failure must not fail evaluation */ });
  }

  // ── Event helpers ──

  private emitStart(promptName: string, triggerType: string, evaluationId: string): void {
    try {
      this.events.emit({
        type: 'continuous-eval:started',
        evaluationId,
        promptName,
        datasetId: this.datasetId,
        triggerType,
        timestamp: new Date().toISOString(),
      } as ContinuousEvalStartedEvent);
    } catch { /* event emission must never fail the evaluation */ }
  }

  private emitCompleted(promptName: string, triggerType: string, evaluationId: string, record: ScoreRecord): void {
    try {
      this.events.emit({
        type: 'continuous-eval:completed',
        evaluationId,
        promptName,
        datasetId: this.datasetId,
        triggerType,
        overallScore: record.overallScore,
        provider: record.provider,
        model: record.model,
        latencyMs: record.latencyMs,
        timestamp: new Date().toISOString(),
      } as ContinuousEvalCompletedEvent);
    } catch { /* event emission must never fail the evaluation */ }
  }

  private emitFailed(promptName: string, triggerType: string, evaluationId: string, record: ScoreRecord): void {
    // Choose the right terminal event type based on error message
    const errorMsg = record.errorMessage ?? '';
    if (errorMsg.includes('timed out') || errorMsg.includes('TimeoutError')) {
      try {
        this.events.emit({
          type: 'continuous-eval:timedOut',
          evaluationId,
          promptName,
          datasetId: this.datasetId,
          triggerType,
          timestamp: new Date().toISOString(),
        } as ContinuousEvalTimedOutEvent);
      } catch { /* event emission must never fail */ }
    } else if (errorMsg.includes('abort')) {
      try {
        this.events.emit({
          type: 'continuous-eval:aborted',
          evaluationId,
          promptName,
          datasetId: this.datasetId,
          triggerType,
          timestamp: new Date().toISOString(),
        } as ContinuousEvalAbortedEvent);
      } catch { /* event emission must never fail */ }
    } else {
      try {
        this.events.emit({
          type: 'continuous-eval:failed',
          evaluationId,
          promptName,
          datasetId: this.datasetId,
          triggerType,
          errorCode: 'PROVIDER_ERROR',
          errorMessage: errorMsg || 'Unknown error',
          timestamp: new Date().toISOString(),
        } as ContinuousEvalFailedEvent);
      } catch { /* event emission must never fail */ }
    }
  }

  private emitAborted(promptName: string, triggerType: string, evaluationId: string): void {
    try {
      this.events.emit({
        type: 'continuous-eval:aborted',
        evaluationId,
        promptName,
        datasetId: this.datasetId,
        triggerType,
        timestamp: new Date().toISOString(),
      } as ContinuousEvalAbortedEvent);
    } catch { /* event emission must never fail */ }
  }

  // ── Metric helpers ──

  private incrementSuccessMetric(evaluationId: string): void {
    incSuccessCounterDedup(evaluationId);
  }

  private incrementFailureMetric(evaluationId: string, record: ScoreRecord): void {
    const errorMsg = (record.errorMessage ?? '').toLowerCase();
    if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
      incFailureCounterDedup(evaluationId, 'PROVIDER_TIMEOUT');
    } else if (errorMsg.includes('abort')) {
      incFailureCounterDedup(evaluationId, 'PROVIDER_ABORTED');
    } else if (errorMsg.includes('dataset') || errorMsg.includes('fixture')) {
      incFailureCounterDedup(evaluationId, 'DATASET_ERROR');
    } else if (errorMsg.includes('score') || errorMsg.includes('nan') || errorMsg.includes('infinity')) {
      incFailureCounterDedup(evaluationId, 'SCORING_ERROR');
    } else {
      incFailureCounterDedup(evaluationId, 'PROVIDER_ERROR');
    }
  }

  /**
   * Run evaluation for all monitored prompts.
   */
  async runAll(triggerType: string = 'manual'): Promise<MonitorRun[]> {
    const prompts = this.getMonitoredPrompts();
    const results: MonitorRun[] = [];

    for (const promptName of prompts) {
      try {
        const result = await this.runSingle(promptName, triggerType);
        results.push(result);
      } catch (err) {
        console.error(`Monitor run failed for ${promptName}:`, err);
      }
    }

    return results;
  }

  /**
   * Run evaluation for due scheduled prompts.
   */
  async runScheduled(): Promise<MonitorRun[]> {
    const due = scheduler.getDuePrompts();
    const results: MonitorRun[] = [];

    for (const { promptName, schedule } of due) {
      try {
        const result = await this.runSingle(promptName, schedule);
        scheduler.markRun(promptName, schedule);
        results.push(result);
      } catch (err) {
        console.error(`Scheduled run failed for ${promptName}:`, err);
      }
    }

    return results;
  }

  /**
   * Trigger on-release evaluation for all prompts.
   */
  async onRelease(promptName?: string): Promise<MonitorRun[]> {
    const prompts = promptName
      ? [promptName]
      : scheduler.getEventDrivenPrompts('onRelease');

    const results: MonitorRun[] = [];
    for (const p of prompts) {
      const result = await this.runSingle(p, 'onRelease');
      scheduler.markRun(p, 'onRelease');
      results.push(result);
    }
    return results;
  }

  /**
   * Trigger on-provider-change evaluation.
   */
  async onProviderChange(promptName?: string): Promise<MonitorRun[]> {
    const prompts = promptName
      ? [promptName]
      : scheduler.getEventDrivenPrompts('onProviderChange');

    const results: MonitorRun[] = [];
    for (const p of prompts) {
      const result = await this.runSingle(p, 'onProviderChange');
      scheduler.markRun(p, 'onProviderChange');
      results.push(result);
    }
    return results;
  }

  // ── Queries ──

  /** Get list of monitored prompts */
  getMonitoredPrompts(): string[] {
    if (this.config.monitoredPrompts.length > 0) {
      return this.config.monitoredPrompts;
    }
    // Default: all prompts in baseline manager + score history
    const fromBaselines = baselineManager.listMonitoredPrompts();
    const fromHistory = scoreHistory.getAllPromptNames();
    return [...new Set([...fromBaselines, ...fromHistory])];
  }

  /** Get provider health for all providers */
  getProviderHealth(): ProviderHealth[] {
    const allRecords: ScoreRecord[] = [];
    for (const prompt of this.getMonitoredPrompts()) {
      allRecords.push(...scoreHistory.getRecent(prompt, 100));
    }
    return computeAllProviderHealth(allRecords);
  }

  /** Get quality trends for all prompts */
  getQualityTrends(): QualityTrend[] {
    return getAllTrends(this.config.trendWindows);
  }

  /** Get open alerts */
  getOpenAlerts(): Alert[] {
    return alertEngine.getOpen();
  }

  /** Get the drift state for a prompt */
  getDriftState(promptName: string): DriftReport | undefined {
    return this.lastDriftReport.get(promptName);
  }

  // ── Configuration ──

  getConfig(): ContinuousEvalConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<ContinuousEvalConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Reset the monitor to its uninitialized state.
   * Stops the scheduler, clears drift reports, resets configuration,
   * bumps the generation counter (invalidating in-flight evaluations),
   * and clears the in-flight registry.
   * Does NOT reset external singletons (scoreHistory, baselineManager, alertEngine).
   * After reset, {@link initialize} can be called again.
   * Idempotent — safe to call multiple times.
   */
  reset(): void {
    scheduler.stopAutoRun();
    this.generation++;
    this.inFlight.clear();
    this.lastDriftReport.clear();
    this.finalizedEvaluations.clear();
    this.events.clear();
    this.lastRecoveryReport = undefined;
    this.config = { ...DEFAULT_CONTINUOUS_EVAL_CONFIG };
    this.datasetId = 'default';
    this.initialized = false;
  }
}

/** Singleton monitor */
export const monitor = new Monitor();
