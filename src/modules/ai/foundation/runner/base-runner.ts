// ============================================
// BaseRunner — Reusable execution runner with
// lifecycle hooks.
//
// Supports: beforeRun, execute, afterRun, error,
// cleanup. All existing runners (evaluation,
// experiment, monitor) can inherit from this.
// ============================================

/**
 * Context passed through the runner lifecycle.
 * Subclasses extend this with domain-specific fields.
 */
export interface RunnerContext {
  /** Unique run identifier (auto-generated if not provided) */
  runId: string;
  /** When the run started */
  startedAt: string;
  /** Arbitrary metadata bag for extensibility */
  metadata: Record<string, unknown>;
}

/**
 * Result returned by every runner execution.
 *
 * @typeParam TOutput — The output type of this runner
 */
export interface RunnerResult<TOutput> {
  /** Whether the run succeeded */
  success: boolean;
  /** The run context (includes timing, metadata) */
  context: RunnerContext;
  /** The output data (if successful) */
  data?: TOutput;
  /** Error information (if failed) */
  error?: {
    message: string;
    stage: 'beforeRun' | 'execute' | 'afterRun' | 'cleanup';
    cause?: unknown;
  };
  /** Total duration in milliseconds */
  durationMs: number;
}

/**
 * Options passed to the runner.
 *
 * @typeParam TInput — The input type
 * @typeParam TOptions — Additional options type
 */
export interface RunnerOptions<TInput, TOptions = void> {
  /** The input data to process */
  input: TInput;
  /** Optional runner-specific options */
  options?: TOptions;
  /** Optional run ID (auto-generated if not provided) */
  runId?: string;
  /** Optional metadata to attach to the context */
  metadata?: Record<string, unknown>;
}

/**
 * Abstract base runner with lifecycle hooks.
 *
 * Subclasses implement the abstract methods to define
 * domain-specific behavior. The base runner manages
 * timing, error handling, and cleanup guarantees.
 *
 * @typeParam TInput — Input type for the run
 * @typeParam TOutput — Output type produced by the run
 * @typeParam TOptions — Additional configuration options
 *
 * @example
 * ```ts
 * class EvalRunner extends BaseRunner<EvalInput, EvalOutput, EvalOptions> {
 *   protected async execute(ctx, input, options): Promise<EvalOutput> {
 *     // ... run evaluation ...
 *   }
 * }
 * ```
 */
export abstract class BaseRunner<TInput, TOutput, TOptions = void> {
  /**
   * Run the full lifecycle: beforeRun → execute → afterRun → cleanup.
   *
   * @param params — Input, options, and metadata
   * @returns The runner result
   */
  async run(params: RunnerOptions<TInput, TOptions>): Promise<RunnerResult<TOutput>> {
    const startTime = Date.now();
    const runId = params.runId ?? this.generateRunId();

    const context: RunnerContext = {
      runId,
      startedAt: new Date().toISOString(),
      metadata: params.metadata ?? {},
    };

    try {
      // Stage 1: beforeRun
      await this.beforeRun(context, params.input, params.options);

      // Stage 2: execute
      const data = await this.execute(context, params.input, params.options);

      // Stage 3: afterRun
      await this.afterRun(context, data);

      return {
        success: true,
        context,
        data,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      // Stage 4: error
      const errorInfo = {
        message: err instanceof Error ? err.message : 'Unknown error',
        stage: 'execute' as const,
        cause: err,
      };

      try {
        await this.onError(context, errorInfo);
      } catch {
        // Swallow errors in error handler to guarantee cleanup runs
      }

      return {
        success: false,
        context,
        error: errorInfo,
        durationMs: Date.now() - startTime,
      };
    } finally {
      // Stage 5: cleanup (always runs)
      try {
        await this.cleanup(context);
      } catch {
        // Swallow cleanup errors
      }
    }
  }

  // ── Lifecycle Hooks (override in subclasses) ──

  /**
   * Called before execution. Override to validate input,
   * set up resources, or initialize state.
   *
   * @param context — Run context
   * @param input — The input data
   * @param options — Runner options
   */
  protected async beforeRun(
    _context: RunnerContext,
    _input: TInput,
    _options?: TOptions,
  ): Promise<void> {
    // Default: no-op
  }

  /**
   * Execute the core logic. Subclasses MUST override this.
   *
   * @param context — Run context
   * @param input — The input data
   * @param options — Runner options
   * @returns The output data
   */
  protected abstract execute(
    context: RunnerContext,
    input: TInput,
    options?: TOptions,
  ): Promise<TOutput>;

  /**
   * Called after successful execution. Override to
   * finalize output, persist results, or emit events.
   *
   * @param context — Run context
   * @param output — The output from execute()
   */
  protected async afterRun(
    _context: RunnerContext,
    _output: TOutput,
  ): Promise<void> {
    // Default: no-op
  }

  /**
   * Called when execution throws. Override to handle
   * errors gracefully — log, emit alerts, or attempt recovery.
   *
   * @param context — Run context
   * @param error — Error details
   */
  protected async onError(
    _context: RunnerContext,
    _error: { message: string; stage: string; cause?: unknown },
  ): Promise<void> {
    // Default: no-op
  }

  /**
   * Called after every run (success or failure).
   * Override to release resources, close connections, etc.
   *
   * @param context — Run context
   */
  protected async cleanup(_context: RunnerContext): Promise<void> {
    // Default: no-op
  }

  // ── Helpers ──

  /**
   * Generate a unique run identifier.
   */
  protected generateRunId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `run-${ts}-${rand}`;
  }

  /**
   * Create an error result manually (for early exits).
   */
  protected errorResult(
    context: RunnerContext,
    message: string,
    stage: 'beforeRun' | 'execute' | 'afterRun' | 'cleanup' = 'execute',
  ): RunnerResult<TOutput> {
    return {
      success: false,
      context,
      error: { message, stage },
      durationMs: Date.now() - new Date(context.startedAt).getTime(),
    };
  }
}
