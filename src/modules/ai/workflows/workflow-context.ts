// Sprint 87: Workflow Context — runtime context passed through workflow stages

import type { ExecutionPolicy } from '@/modules/ai/runtime/execution-policy';
import type { PipelineResult } from '@/modules/ai/pipeline/pipeline-types';
import type { StageResult } from './workflow-stage';

export interface WorkflowContext<TInput = unknown, TOutput = unknown> {
  /** Original request input */
  request: TInput;
  /** Accumulated response (built across stages) */
  response: Partial<TOutput>;
  /** Execution policy for this workflow run */
  executionPolicy: ExecutionPolicy;
  /** Provider used (set after provider stage) */
  provider?: string;
  /** Retry count across all stages */
  retryCount: number;
  /** Non-critical warnings */
  warnings: string[];
  /** Stage execution results */
  stages: StageResult[];
  /** Arbitrary metadata */
  metadata: Record<string, unknown>;
  /** Pipeline result (if applicable) */
  pipelineResult?: PipelineResult<unknown>;
}
