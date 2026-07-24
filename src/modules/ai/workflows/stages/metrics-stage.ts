// Sprint 88: Metrics Stage — records runtime metrics for observability
// Delegates to runtime-metrics.ts. No provider/business logic.

import type { WorkflowStage } from '../workflow-stage';
import type { WorkflowContext } from '../workflow-context';
import { recordProviderCall } from '@/modules/ai/services/runtime-metrics';
import { recordStage } from '@/modules/ai/services/ai-observability';

export const MetricsStage: WorkflowStage<WorkflowContext> = {
  name: 'metrics',
  async execute(ctx) {
    const result = ctx.pipelineResult;
    if (result) {
      recordProviderCall(result.provider || 'unknown', true, result.totalLatencyMs || 0);
      recordStage('pipeline', result.totalLatencyMs || 0, !!(result.data));
    }
    return ctx;
  },
};
