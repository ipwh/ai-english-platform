// ============================================
// Sprint 104: Repair Planner
// Collects failed rules, groups compatible repairs, resolves priority,
// prevents conflicting repairs, produces deterministic repair plan.
// ============================================

import type { RuleCheckResult } from '../quality-types';
import { RepairAction, compareRepairPriority } from './repair-action';
import { RepairPlan, type RepairStep } from './repair-plan';
import { getRepairAction, getRuleTarget, resolveRepairAction } from './repair-strategy';
import { canPatch, canRegenerate, type RepairBudget } from './repair-budget';
import { logger } from '@/shared/logger/logger';

export class RepairPlanner {
  /**
   * Build a repair plan from failed quality rule results.
   *
   * Steps:
   * 1. Collect all failed rules
   * 2. Map each rule to its recommended repair action
   * 3. Group compatible repairs (merge NORMALIZE actions, deduplicate targets)
   * 4. Resolve priority (normalize first, reject last)
   * 5. Apply budget constraints (remove steps that exceed budget)
   * 6. Produce deterministic plan
   */
  buildPlan(
    results: Map<string, RuleCheckResult>,
    budget: RepairBudget,
  ): RepairPlan {
    const steps: RepairStep[] = [];
    const seenTargets = new Set<string>();

    // Collect failed rules
    for (const [ruleId, result] of results) {
      if (result.passed) continue;
      if (result.failures.length === 0) continue;

      const action = getRepairAction(ruleId);
      if (action === RepairAction.NONE) continue;

      // Check budget
      const isRegen = action === RepairAction.REGENERATE_FIELD || action === RepairAction.REGENERATE_QUESTION;
      if (isRegen && !canRegenerate(budget)) {
        logger.warn({ module: 'repair-planner', ruleId, action }, 'Regeneration budget exceeded — skipping');
        continue;
      }
      if (!isRegen && !canPatch(budget)) {
        logger.warn({ module: 'repair-planner', ruleId, action }, 'Patch budget exceeded — skipping');
        continue;
      }

      // Determine target field
      const target = getRuleTarget(ruleId);

      // Merge duplicate targets (same target + same action = merge)
      const existing = steps.find(s => s.target === target && s.action === action);
      if (existing) {
        existing.originalValue = `${existing.originalValue || ''}; ${result.failures[0]?.message || ''}`;
        continue;
      }

      // For NORMALIZE, collapse all into one step
      if (action === RepairAction.NORMALIZE) {
        if (steps.some(s => s.action === RepairAction.NORMALIZE)) continue;
      }

      steps.push({
        ruleId,
        action,
        target,
        originalValue: result.failures[0]?.message || undefined,
        order: 0, // will be set by RepairPlan constructor
      });
    }

    // Sort by action priority
    steps.sort((a, b) => compareRepairPriority(a.action, b.action));

    // Re-index order
    steps.forEach((s, i) => { s.order = i; });

    const plan = new RepairPlan(steps);

    logger.info({
      module: 'repair-planner',
      failedRules: results.size,
      planSteps: plan.stepCount,
      estimatedCost: plan.estimatedCost,
      requiresLLM: plan.requiresLLM,
    }, 'Repair plan built');

    return plan;
  }

  /**
   * Quick check: can any of the failed rules be repaired?
   */
  canRepair(results: Map<string, RuleCheckResult>): boolean {
    for (const [ruleId, result] of results) {
      if (result.passed) continue;
      const action = getRepairAction(ruleId);
      if (action !== RepairAction.NONE && action !== RepairAction.REJECT) {
        return true;
      }
    }
    return false;
  }
}

/** Singleton instance */
export const repairPlanner = new RepairPlanner();
