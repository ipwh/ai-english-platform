// Sprint 89: Analyze Writing Workflow

import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const AnalyzeWritingWorkflow = defineWorkflow({
  name: 'analyze-writing',
  description: 'Analyze student writing with DSE grading',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage],
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 4096 },
  tags: ['ai', 'writing', 'analysis'],
});

workflowRegistry.register(AnalyzeWritingWorkflow);
