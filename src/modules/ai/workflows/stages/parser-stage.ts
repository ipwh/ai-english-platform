// Sprint 88: Parser Stage — delegates to response-parser.ts
// No provider/business logic. Pure parsing delegation.

import type { WorkflowStage } from '../workflow-stage';
import type { WorkflowContext } from '../workflow-context';

export const ParserStage: WorkflowStage<WorkflowContext> = {
  name: 'parser',
  async execute(ctx) {
    // Parsing is handled internally by executeAIPipeline via response-parser.ts.
    // This stage exists for observability — tracking parse/repair events.
    if (ctx.pipelineResult && (ctx.pipelineResult as any).repaired) {
      ctx.warnings.push('AI response was repaired (truncated JSON)');
    }
    return ctx;
  },
};
