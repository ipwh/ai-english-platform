// Sprint 88: Provider Stage — delegates to existing AI pipeline
// Does NOT import providers directly. Delegates to executeAIPipeline.

import type { WorkflowStage } from '../workflow-stage';
import type { WorkflowContext } from '../workflow-context';
import { executeAIPipeline } from '@/modules/ai/pipeline/ai-request-pipeline';
import { logger } from '@/shared/logger/logger';

export const ProviderStage: WorkflowStage<WorkflowContext> = {
  name: 'provider',
  async execute(ctx) {
    const messages = ctx.metadata.messages as any[];
    const schema = ctx.metadata.outputSchema as any;
    const pipelineCtx = ctx.metadata.pipelineContext as any;

    if (!messages || !schema || !pipelineCtx) {
      logger.warn({ module: 'provider-stage' }, 'ProviderStage: missing messages/schema/pipelineContext — skipping');
      return ctx;
    }

    const result = await executeAIPipeline(messages, schema, pipelineCtx);
    ctx.pipelineResult = result as any;
    ctx.provider = result.provider;
    ctx.retryCount = result.retryCount;
    ctx.warnings.push(...result.warnings);
    return ctx;
  },
};
