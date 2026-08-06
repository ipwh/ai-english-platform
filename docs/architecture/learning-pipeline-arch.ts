// ============================================
// Learning Pipeline — orchestration abstraction
//
// Defines the stages of an adaptive learning cycle
// without implementing any business logic.
//
// Stages are composable, swappable, and testable in isolation.
// The pipeline itself is a pure orchestration shell.
//
// Architecture mirrors AIExecutionPipeline:
//   - LearningPipelineStage  ≈ AIExecutionMiddleware
//   - LearningPipelineContext ≈ AIExecutionContext
//   - LearningPipeline.run() ≈ AIExecutionPipeline.run()
// ============================================

// ============================================
// LearningPipelineContext — typed state bag
// ============================================

export interface LearningPipelineContext {
  /** Target student identifier */
  studentId?: string;

  /** The exercise generated for the student */
  exercise?: unknown;

  /** The student's submitted answer */
  studentAnswer?: unknown;

  /** AI evaluation of the student's answer */
  evaluation?: unknown;

  /** Learning memory snapshot (strengths, weaknesses, history) */
  learningMemory?: unknown;

  /** Mastery estimate per skill (0–100) */
  mastery?: unknown;

  /** Recommended next action (e.g. "retry", "advance", "review") */
  nextAction?: unknown;

  /** Pipeline metadata for tracing */
  metadata?: {
    /** Feature area (e.g. "Reading", "Grammar") */
    feature: string;
    /** Session identifier for grouping pipeline runs */
    sessionId?: string;
  };
}

// ============================================
// LearningPipelineStage — composable step
// ============================================

export interface LearningPipelineStage {
  /** Human-readable stage name for debugging/telemetry */
  readonly name: string;

  /**
   * Execute this stage.
   *
   * @param context — mutable state bag shared across the pipeline
   * @param next    — call to proceed to the next stage in the chain
   */
  execute(
    context: LearningPipelineContext,
    next: () => Promise<void>,
  ): Promise<void>;
}

// ============================================
// LearningPipeline — composable stage runner
// ============================================

export class LearningPipeline {
  constructor(private readonly stages: LearningPipelineStage[]) {}

  /**
   * Run the pipeline: invoke each stage in order.
   * Each stage receives (context, next) where next() advances
   * to the next stage in the chain.
   */
  async run(context: LearningPipelineContext): Promise<void> {
    const dispatch = async (index: number): Promise<void> => {
      if (index >= this.stages.length) return;
      const stage = this.stages[index];
      await stage.execute(context, () => dispatch(index + 1));
    };
    await dispatch(0);
  }
}
