// Sprint 87: Workflow Stage — composable stage interface for AI workflows

export interface WorkflowStage<TContext = Record<string, unknown>> {
  /** Stage name for observability */
  name: string;
  /** Execute the stage */
  execute(context: TContext): Promise<TContext>;
  /** Optional rollback if a later stage fails */
  rollback?(context: TContext): Promise<void>;
}

/** Stage execution result */
export interface StageResult {
  stageName: string;
  success: boolean;
  durationMs: number;
  error?: string;
}
