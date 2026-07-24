// Sprint 90: Analyze Progress Workflow
import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const AnalyzeProgressWorkflow = defineWorkflow({
  name: 'analyze-progress',
  description: 'Analyze student learning progress with AI',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage] as any,
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 2048 },
  tags: ['ai', 'progress', 'analysis'],
});
workflowRegistry.register(AnalyzeProgressWorkflow);
