// Sprint 89: Explain Mistake Workflow

import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const ExplainMistakeWorkflow = defineWorkflow({
  name: 'explain-mistake',
  description: 'Explain student mistakes with grammar rules',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage],
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 2048 },
  tags: ['ai', 'mistake', 'explanation'],
});

workflowRegistry.register(ExplainMistakeWorkflow);
