// Sprint 88: Result Stage — builds WorkflowResult<T> from context
// No provider/business logic. Pure result assembly.

import type { WorkflowStage } from '../workflow-stage';
import type { WorkflowContext } from '../workflow-context';
import type { WorkflowResult } from '../workflow-engine';

export const ResultStage: WorkflowStage<WorkflowContext> = {
  name: 'result',
  async execute(ctx) {
    const result = ctx.pipelineResult;
    ctx.response = {
      success: !!(result?.data),
      data: result?.data,
      provider: ctx.provider,
      stages: ctx.stages,
      totalLatencyMs: result?.totalLatencyMs || 0,
      retryCount: ctx.retryCount,
      warnings: ctx.warnings,
    } satisfies Partial<WorkflowResult>;
    return ctx;
  },
};
