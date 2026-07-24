// ============================================
// Sprint 104: Repair Pipeline
// Orchestrates: Quality Engine → Repair Planner → Repair Engine → Revalidate → Approve/Reject
// ============================================

import type { QualityResult, QualityContext } from '../quality-types';
import type { RepairBudget } from './repair-budget';
import { createRepairBudget, recordPatch, recordRegeneration, getBudgetUsage } from './repair-budget';
import { repairPlanner } from './repair-planner';
import { RepairAction } from './repair-action';
import { RepairPlan } from './repair-plan';
import { applyAllRepairs } from '../repair-engine';
import { qualityEngine } from '../quality-engine';
import { qualityRegistry } from '../quality-registry';
import { recordRepairAttempt, recordRepairSuccess, recordRepairFailure } from './repair-metrics';
import { logRepairHistory } from './repair-history';
import { logger } from '@/shared/logger/logger';

export interface RepairPipelineResult<T = unknown> {
  /** Whether the output passed after repairs */
  approved: boolean;
  /** The final (possibly repaired) output */
  output: T;
  /** Initial quality result before repairs */
  initialQuality: QualityResult<T>;
  /** Final quality result after repairs (if repairs were attempted) */
  finalQuality?: QualityResult<T>;
  /** The repair plan that was executed (or null if none) */
  plan: RepairPlan | null;
  /** Budget usage report */
  budget: ReturnType<typeof getBudgetUsage>;
  /** Summary: what happened */
  summary: string;
}

export class RepairPipeline {
  /**
   * Execute the full self-healing pipeline.
   *
   * Flow:
   * 1. Run Quality Engine → get initial result
   * 2. If passed, return immediately (no repairs needed)
   * 3. Build repair plan from failed rules
   * 4. Execute repairs through Repair Engine
   * 5. Re-validate with Quality Engine
   * 6. Return final result
   */
  async execute<T extends Record<string, unknown>>(
    input: T,
    context: QualityContext,
    budgetOverrides?: Partial<Pick<RepairBudget, 'maxPatches' | 'maxRegenerations' | 'maxRepairTimeMs'>>,
  ): Promise<RepairPipelineResult<T>> {
    const budget = createRepairBudget(budgetOverrides);
    const startTime = Date.now();

    // Step 1: Initial quality check
    const initialResult = await qualityEngine.execute(input, context);

    // Step 2: If passed, no repairs needed
    if (initialResult.passed && initialResult.errors.length === 0) {
      logger.info({ module: 'repair-pipeline', outputType: context.outputType, score: initialResult.score }, 'Output passed quality check — no repairs needed');
      return {
        approved: true,
        output: initialResult.output,
        initialQuality: initialResult,
        plan: null,
        budget: getBudgetUsage(budget),
        summary: 'Passed initial quality check — no repairs needed',
      };
    }

    // Step 3: Build repair plan
    // We need the raw results — re-run just the rule execution
    const { results } = qualityRegistry.executeAll(input, context);
    const plan = repairPlanner.buildPlan(results, budget);

    if (plan.isEmpty) {
      logger.warn({ module: 'repair-pipeline', failedRules: results.size }, 'No repairable failures — rejecting output');
      recordRepairFailure('pipeline:no-plan');
      return {
        approved: false,
        output: input,
        initialQuality: initialResult,
        plan,
        budget: getBudgetUsage(budget),
        summary: `No repairable failures — ${initialResult.errors.length} errors, ${initialResult.warnings.length} warnings`,
      };
    }

    // Step 4: Execute repairs
    logger.info({ module: 'repair-pipeline', steps: plan.stepCount, estimatedCost: plan.estimatedCost }, 'Executing repair plan');

    let current = input;
    let repairSuccesses = 0;
    let repairFailures = 0;
    const repairStartTime = Date.now();

    for (const step of plan.steps) {
      const stepStart = Date.now();

      try {
        // Apply repair based on action
        const allFailures = [
          { ruleId: step.ruleId, message: step.originalValue || 'unknown failure' },
        ];

        if (step.action === RepairAction.NORMALIZE) {
          const { output } = applyAllRepairs(current, allFailures, context);
          current = output as unknown as T;
          recordPatch(budget);
        } else if (step.action.startsWith('PATCH_')) {
          const { output } = applyAllRepairs(current, allFailures, context);
          current = output as unknown as T;
          recordPatch(budget);
        } else if (step.action === RepairAction.REGENERATE_FIELD || step.action === RepairAction.REGENERATE_QUESTION) {
          // Regeneration would call LLM — not implemented in this sprint per spec
          // "Never invoke another LLM for validation"
          // For now, mark as failed and continue
          logger.warn({ module: 'repair-pipeline', step: step.ruleId, action: step.action }, 'Regeneration not yet implemented — skipping');
          recordRegeneration(budget);
          repairFailures++;
          continue;
        } else if (step.action === RepairAction.REJECT) {
          recordRepairFailure('pipeline:rejected');
          return {
            approved: false,
            output: current,
            initialQuality: initialResult,
            plan,
            budget: getBudgetUsage(budget),
            summary: 'Repair plan requires REJECT — output cannot be salvaged',
          };
        }

        // Log repair to history
        logRepairHistory({
          ruleId: step.ruleId,
          action: step.action,
          target: step.target,
          originalValue: step.originalValue,
          durationMs: Date.now() - stepStart,
          success: true,
        });

        recordRepairAttempt(step.action, Date.now() - stepStart);
        recordRepairSuccess(step.action);
        repairSuccesses++;

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ module: 'repair-pipeline', step: step.ruleId, error: msg }, 'Repair step failed');
        logRepairHistory({
          ruleId: step.ruleId,
          action: step.action,
          target: step.target,
          originalValue: step.originalValue,
          durationMs: Date.now() - stepStart,
          success: false,
          error: msg,
        });
        recordRepairFailure(`pipeline:step-error:${step.ruleId}`);
        repairFailures++;
      }
    }

    const repairDurationMs = Date.now() - repairStartTime;

    // Step 5: Re-validate
    let finalResult: QualityResult<T> | undefined;
    try {
      finalResult = await qualityEngine.execute(current, context);
    } catch {
      logger.warn({ module: 'repair-pipeline' }, 'Re-validation failed after repairs');
    }

    // Step 6: Determine approval
    const approved = !!finalResult?.passed;

    const summary = [
      `Repairs: ${repairSuccesses} succeeded, ${repairFailures} failed`,
      `Repair time: ${repairDurationMs}ms`,
      `Initial score: ${initialResult.score} → Final score: ${finalResult?.score ?? 'N/A'}`,
      approved ? 'APPROVED' : 'REJECTED',
    ].join(' | ');

    logger.info({
      module: 'repair-pipeline',
      approved,
      repairSuccesses,
      repairFailures,
      repairDurationMs,
      initialScore: initialResult.score,
      finalScore: finalResult?.score,
      budgetExceeded: budget.exceeded,
    }, 'Repair pipeline complete');

    return {
      approved,
      output: current,
      initialQuality: initialResult,
      finalQuality: finalResult,
      plan,
      budget: getBudgetUsage(budget),
      summary,
    };
  }
}

/** Singleton instance */
export const repairPipeline = new RepairPipeline();
