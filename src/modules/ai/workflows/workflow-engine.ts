// Sprint 87: Workflow Engine — executes declarative workflows through the AI pipeline
// Does NOT duplicate pipeline logic. Orchestrates stages and delegates to pipeline.

import type { WorkflowDefinition } from './workflow';
import type { WorkflowContext } from './workflow-context';
import type { WorkflowStage, StageResult } from './workflow-stage';
import { executeAIPipeline } from '@/modules/ai/pipeline/ai-request-pipeline';
import { buildPipelineContext } from '@/modules/ai/pipeline/pipeline-context';
import { DEFAULT_EXECUTION_POLICY } from '@/modules/ai/runtime/execution-policy';
import { logger } from '@/shared/logger/logger';
import type { ZodSchema } from 'zod';
import type { ChatMessage } from '@/modules/ai/providers/types';

export interface WorkflowResult<TOutput = unknown> {
  success: boolean;
  data?: TOutput;
  error?: string;
  stages: StageResult[];
  provider?: string;
  totalLatencyMs: number;
  retryCount: number;
  warnings: string[];
}

class WorkflowEngine {
  /**
   * Execute a workflow definition with input.
   * Stages execute sequentially. Pipeline handles provider/retry/parse/validate.
   */
  async execute<TInput, TOutput>(
    workflow: WorkflowDefinition<TInput, TOutput>,
    input: TInput,
    options?: {
      buildMessages?: (input: TInput) => ChatMessage[];
      outputSchema?: ZodSchema<TOutput>;
    },
  ): Promise<WorkflowResult<TOutput>> {
    const startTime = Date.now();
    const stages: StageResult[] = [];
    const warnings: string[] = [];
    let retryCount = 0;

    // Build pipeline context
    const policy = workflow.executionPolicy || DEFAULT_EXECUTION_POLICY;
    const pipelineCtx = buildPipelineContext({
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

    try {
      // If the workflow has custom stages, execute them
      if (workflow.stages.length > 0) {
        let ctx: WorkflowContext = {
          request: input,
          response: {} as Partial<TOutput>,
          executionPolicy: policy,
          retryCount: 0,
          warnings: [],
          stages: [],
          metadata: {} as Record<string, unknown>,
        };

        for (const stage of workflow.stages) {
          const stageStart = Date.now();
          try {
            ctx = await (stage as unknown as WorkflowStage<WorkflowContext>).execute(ctx);
            stages.push({ stageName: stage.name, success: true, durationMs: Date.now() - stageStart });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            stages.push({ stageName: stage.name, success: false, durationMs: Date.now() - stageStart, error: msg });
            return { success: false, error: msg, stages, totalLatencyMs: Date.now() - startTime, retryCount, warnings };
          }
        }

        return {
          success: true,
          data: ctx.response as TOutput,
          stages,
          provider: ctx.provider,
          totalLatencyMs: Date.now() - startTime,
          retryCount: ctx.retryCount,
          warnings: ctx.warnings,
        };
      }

      // No custom stages — use pipeline directly
      if (!options?.buildMessages || !options?.outputSchema) {
        return { success: false, error: 'Workflow requires buildMessages + outputSchema when no custom stages defined', stages, totalLatencyMs: Date.now() - startTime, retryCount: 0, warnings };
      }

      const messages = options.buildMessages(input);
      const result = await executeAIPipeline(messages, options.outputSchema, pipelineCtx);

      return {
        success: true,
        data: result.data,
        stages: result.stages.map(s => ({ stageName: s.stage, success: s.success, durationMs: s.durationMs, error: s.error })),
        provider: result.provider,
        totalLatencyMs: result.totalLatencyMs,
        retryCount: result.retryCount,
        warnings: result.warnings,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ module: 'workflow-engine', workflow: workflow.name, error: msg }, 'Workflow execution failed');
      return { success: false, error: msg, stages, totalLatencyMs: Date.now() - startTime, retryCount, warnings };
    }
  }
}

export const workflowEngine = new WorkflowEngine();
