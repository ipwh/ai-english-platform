// ============================================
// PipelineRunner — Reusable multi-stage execution
// pipeline: validate → prepare → execute →
// aggregate → persist → report.
//
// Designed for evaluation, experimentation, and
// monitoring workflows that follow the same
// canonical pipeline structure.
// ============================================

import type {
  PipelineResult, PipelineStep, StepMetric, ValidationResult,
} from '../types';

/**
 * Configuration for a pipeline run.
 *
 * @typeParam TInput — Raw input type
 * @typeParam TPrepared — Input after preparation
 * @typeParam TExecuted — Result after execution
 * @typeParam TAggregated — Aggregated results
 * @typeParam TOutput — Final output type
 */
export interface PipelineConfig<TInput, TPrepared, TExecuted, TAggregated, TOutput> {
  /** Pipeline name (for logging) */
  name: string;

  /** Validate raw input */
  validate: (input: TInput) => ValidationResult;

  /** Prepare/transform input for execution */
  prepare: (input: TInput) => Promise<TPrepared>;

  /** Execute the core operation */
  execute: (prepared: TPrepared) => Promise<TExecuted>;

  /** Aggregate results (e.g., compute scores) */
  aggregate: (executed: TExecuted) => Promise<TAggregated>;

  /** Persist results (e.g., save to DB) */
  persist?: (aggregated: TAggregated) => Promise<void>;

  /** Generate a report */
  report: (aggregated: TAggregated) => Promise<TOutput>;
}

/**
 * A reusable execution pipeline with six canonical stages.
 *
 * Flow: validate → prepare → execute → aggregate → persist → report
 *
 * Each stage is timed independently. If validate fails,
 * the pipeline short-circuits and returns an error result.
 * Persist is optional and skipped if not configured.
 *
 * @typeParam TInput — Raw input type
 * @typeParam TPrepared — Input after preparation
 * @typeParam TExecuted — Result after execution
 * @typeParam TAggregated — Aggregated results
 * @typeParam TOutput — Final output type
 *
 * @example
 * ```ts
 * const pipeline = new PipelineRunner({
 *   name: 'RegressionEval',
 *   validate: (input) => ({ valid: true, errors: [], warnings: [] }),
 *   prepare: async (input) => loadFixtures(input),
 *   execute: async (fixtures) => evaluateAll(fixtures),
 *   aggregate: async (results) => computeScores(results),
 *   report: async (scores) => generateReport(scores),
 * });
 *
 * const result = await pipeline.run(rawInput);
 * ```
 */
export class PipelineRunner<TInput, TPrepared, TExecuted, TAggregated, TOutput> {
  constructor(private readonly config: PipelineConfig<TInput, TPrepared, TExecuted, TAggregated, TOutput>) {}

  /**
   * Run the full pipeline.
   *
   * @param input — Raw input
   * @returns Pipeline result with metrics for each stage
   */
  async run(input: TInput): Promise<PipelineResult<TOutput>> {
    const metrics: StepMetric[] = [];
    const startTime = Date.now();

    try {
      // Stage 1: Validate
      const validation = await this.runStage('validate', () => {
        return Promise.resolve(this.config.validate(input));
      }, metrics);

      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join('; ')}`,
          stepMetrics: metrics,
          totalDurationMs: Date.now() - startTime,
        };
      }

      // Stage 2: Prepare
      const prepared = await this.runStage('prepare', () => {
        return this.config.prepare(input);
      }, metrics);

      // Stage 3: Execute
      const executed = await this.runStage('execute', () => {
        return this.config.execute(prepared);
      }, metrics);

      // Stage 4: Aggregate
      const aggregated = await this.runStage('aggregate', () => {
        return this.config.aggregate(executed);
      }, metrics);

      // Stage 5: Persist (optional)
      if (this.config.persist) {
        await this.runStage('persist', () => {
          return this.config.persist!(aggregated);
        }, metrics);
      }

      // Stage 6: Report
      const report = await this.runStage('report', () => {
        return this.config.report(aggregated);
      }, metrics);

      return {
        success: true,
        data: report,
        stepMetrics: metrics,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Pipeline execution failed',
        stepMetrics: metrics,
        totalDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a single stage with timing.
   */
  private async runStage<T>(
    name: string,
    fn: () => Promise<T>,
    metrics: StepMetric[],
  ): Promise<T> {
    const stageStart = Date.now();
    try {
      const result = await fn();
      metrics.push({ step: name, durationMs: Date.now() - stageStart, success: true });
      return result;
    } catch (err) {
      metrics.push({
        step: name,
        durationMs: Date.now() - stageStart,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }
}
