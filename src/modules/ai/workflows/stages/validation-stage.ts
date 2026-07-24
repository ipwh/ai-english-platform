// Sprint 88: Validation Stage — delegates to Zod schema validation
// No provider/business logic. Pure validation delegation.

import type { WorkflowStage } from '../workflow-stage';
import type { WorkflowContext } from '../workflow-context';

export const ValidationStage: WorkflowStage<WorkflowContext> = {
  name: 'validation',
  async execute(ctx) {
    // Validation is handled internally by executeAIPipeline via Zod schemas.
    // This stage exists for observability — tracking validation events.
    const result = ctx.pipelineResult as any;
    if (result && !result.data) {
      ctx.warnings.push('Pipeline result has no validated data');
    }
    return ctx;
  },
};
