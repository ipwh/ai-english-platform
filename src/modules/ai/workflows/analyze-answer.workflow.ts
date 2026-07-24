// Sprint 89: Analyze Answer Workflow

import { defineWorkflow, workflowRegistry } from '@/modules/ai/workflows';
import { ContextStage, ProviderStage, MetricsStage, ResultStage } from '@/modules/ai/workflows/stages';
import { JSON_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';

export const AnalyzeAnswerWorkflow = defineWorkflow({
  name: 'analyze-answer',
  description: 'Analyze student answers with AI feedback',
  stages: [ContextStage, ProviderStage, MetricsStage, ResultStage] as any,
  executionPolicy: { ...JSON_EXECUTION_POLICY, maxTokens: 2048 },
  tags: ['ai', 'answer', 'analysis'],
});

workflowRegistry.register(AnalyzeAnswerWorkflow);
