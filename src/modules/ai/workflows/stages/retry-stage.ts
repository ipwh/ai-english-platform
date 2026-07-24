// Sprint 88: Retry Stage — delegates to retry.ts
// No provider/business logic. Pure retry delegation.

import type { WorkflowStage } from '../workflow-stage';
import type { WorkflowContext } from '../workflow-context';

export const RetryStage: WorkflowStage<WorkflowContext> = {
  name: 'retry',
  async execute(ctx) {
    // Retry is handled internally by executeAIPipeline via retry.ts.
    // This stage exists for observability — tracking retry decisions.
    if (ctx.pipelineResult?.retryCount && ctx.pipelineResult.retryCount > 0) {
      ctx.retryCount = ctx.pipelineResult.retryCount;
    }
    return ctx;
  },
};
