// Sprint 90: Analyze Word Workflow
import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const AnalyzeWordWorkflow = defineWorkflow({
  name: 'analyze-word',
  description: 'Analyze vocabulary words with AI',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage],
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 2048 },
  tags: ['ai', 'vocabulary', 'analysis'],
});
workflowRegistry.register(AnalyzeWordWorkflow);
