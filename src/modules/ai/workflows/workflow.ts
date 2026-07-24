// Sprint 87: Workflow Definition — declarative workflow configuration

import type { WorkflowStage } from './workflow-stage';
import type { WorkflowContext } from './workflow-context';
import type { ExecutionPolicy } from '@/modules/ai/runtime/execution-policy';
import type { ZodSchema } from 'zod';

export interface WorkflowDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique workflow name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Ordered stages to execute */
  stages: WorkflowStage<WorkflowContext>[];
  /** Default execution policy */
  executionPolicy: ExecutionPolicy;
  /** Output schema for validation */
  outputSchema?: ZodSchema<TOutput>;
  /** Workflow tags for discovery */
  tags: string[];
  /** Metadata */
  metadata?: Record<string, string>;
}

/** Helper to define a workflow with type inference */
export function defineWorkflow<TInput = unknown, TOutput = unknown>(
  config: WorkflowDefinition<TInput, TOutput>,
): WorkflowDefinition<TInput, TOutput> {
  return config;
}
