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
import { continuousEvaluator } from './evaluator';
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

// ── Types ──

/** Complete monitor run result */
export interface MonitorRun {
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

    // Set up scheduler auto-run
    const callback: ScheduledEvalCallback = async (promptName, triggerType) => {
      await this.runSingle(promptName, triggerType);
    };

    scheduler.startAutoRun(callback);
    this.initialized = true;
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

    // Create the evaluation Promise, attach cleanup, and register atomically
    const promise = this.doRunSingle(promptName, triggerType, generationAtStart)
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
   * Internal evaluation implementation with generation guard.
   * If the monitor was reset during execution, silently discards state mutations.
   */
  private async doRunSingle(
    promptName: string,
    triggerType: string,
    startGeneration: number,
  ): Promise<MonitorRun> {
    // 1. Run evaluation
    const record = await continuousEvaluator.evaluate({
      providerCall: this.providerCall,
      loadDataset: this.loadDataset,
      datasetId: this.datasetId,
      promptName,
      promptVersion: `${promptName}@latest`,
      triggerType,
    });

    // 2. Drift detection — only update Monitor-owned state if generation matches
    let drift: DriftReport | undefined;
    const baseline = baselineManager.getComparisonBaseline(promptName);
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

    // 3. Regression check
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const previousSummary = scoreHistory.getSummary(promptName, weekAgo);
    const regression = checkRegression(
      promptName,
      record,
      baseline?.record,
      previousSummary,
      this.config.alertThresholds,
    );

    // Check for sustained regression
    const recentRecords = scoreHistory.getRecent(promptName, 10);
    const sustained = checkSustainedRegression(recentRecords);

    // 4. Generate alerts
    const alerts = alertEngine.evaluate(
      record,
      this.config.alertThresholds,
      baseline?.record,
    );

    // If sustained regression, add a critical alert
    if (sustained.isSustained) {
      const alert = alertEngine.evaluate(
        { ...record, overallScore: record.overallScore - 5 }, // Force alert
        this.config.alertThresholds,
        baseline?.record,
      );
      alerts.push(...alert.filter(a => a.category === 'overall_drop'));
    }

    // 5. Update baselines — only if evaluation succeeded (prevents
    //    provider failure from corrupting production/golden baselines)
    if (record.success) {
      if (baselineManager.getLatestBaseline(promptName)) {
        baselineManager.updateLatestBaseline(promptName, triggerType);
      } else {
        if (!baselineManager.getProductionBaseline(promptName)) {
          baselineManager.setProductionBaseline(promptName, record, 'auto-init');
        }
        baselineManager.updateLatestBaseline(promptName, triggerType);
      }

      // 6. Auto-update baseline if improved and configured
      if (this.config.autoUpdateBaseline && baseline) {
        if (record.overallScore > baseline.record.overallScore + 2) {
          baselineManager.updateProductionBaseline(promptName, 'Auto-updated: score improved');
        }
      }
    }

    // 7. Compute trend
    const trend = computeQualityTrend(promptName, this.config.trendWindows);

    return {
      promptName,
      triggerType,
      record,
      drift,
      regression,
      alerts,
      trend,
      timestamp: new Date().toISOString(),
    };
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
    this.config = { ...DEFAULT_CONTINUOUS_EVAL_CONFIG };
    this.datasetId = 'default';
    this.initialized = false;
  }
}

/** Singleton monitor */
export const monitor = new Monitor();
