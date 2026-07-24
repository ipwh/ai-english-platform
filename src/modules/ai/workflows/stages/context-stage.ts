// Sprint 88: Context Stage — builds workflow context from request input
// Delegates to pipeline-context.ts. No provider/business logic.

import type { WorkflowStage } from '../workflow-stage';
import type { WorkflowContext } from '../workflow-context';
import { buildPipelineContext } from '@/modules/ai/pipeline/pipeline-context';
import { DEFAULT_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const ContextStage: WorkflowStage<WorkflowContext> = {
  name: 'context',
  async execute(ctx) {
    const policy = ctx.executionPolicy || DEFAULT_EXECUTION_POLICY;
    ctx.metadata.pipelineContext = buildPipelineContext({
      skill: 'general',
      skillZh: '一般',
      difficulty: 'core',
      gradeLevel: 'S4',
      options: {
        temperature: policy.temperature,
        maxTokens: policy.maxTokens,
        jsonMode: true,
        timeoutMs: policy.timeoutMs,
        maxRetries: policy.maxRetries,
      },
    });
    return ctx;
  },
};
