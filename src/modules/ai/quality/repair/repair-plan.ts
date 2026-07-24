// ============================================
// Sprint 104: Repair Plan
// Deterministic plan for self-healing an AI output.
// ============================================

import type { RepairAction } from './repair-action';
import { compareRepairPriority, REPAIR_ACTION_COST, RepairCost } from './repair-action';

export interface RepairStep {
  /** Which rule triggered this repair */
  ruleId: string;
  /** What action to take */
  action: RepairAction;
  /** Which field(s) to target */
  target: string;
  /** The original (faulty) value for audit trail */
  originalValue?: string;
  /** Priority order (lower = execute first) */
  order: number;
}

export class RepairPlan {
  readonly steps: RepairStep[] = [];
  /** Estimated total cost of the plan */
  readonly estimatedCost: RepairCost;
  /** Whether the plan requires LLM calls */
  readonly requiresLLM: boolean;

  constructor(steps: RepairStep[]) {
    // Sort by priority (normalize first, reject last)
    this.steps = [...steps].sort((a, b) => compareRepairPriority(a.action, b.action));
    // Re-index order
    this.steps.forEach((s, i) => { s.order = i; });

    // Calculate cost
    if (this.steps.length === 0) {
      this.estimatedCost = RepairCost.LOW;
      this.requiresLLM = false;
    } else {
      const costs = this.steps.map(s => REPAIR_ACTION_COST[s.action]);
      this.estimatedCost = costs.includes(RepairCost.VERY_HIGH) ? RepairCost.VERY_HIGH
        : costs.includes(RepairCost.HIGH) ? RepairCost.HIGH
        : costs.includes(RepairCost.MEDIUM) ? RepairCost.MEDIUM
        : RepairCost.LOW;
      this.requiresLLM = this.steps.some(s =>
        s.action === 'REGENERATE_FIELD' || s.action === 'REGENERATE_QUESTION'
      );
    }
  }

  /** Whether this plan is empty (no repairs needed). */
  get isEmpty(): boolean { return this.steps.length === 0; }

  /** Number of steps. */
  get stepCount(): number { return this.steps.length; }

  /** All targeted fields in execution order. */
  get targetFields(): string[] {
    return [...new Set(this.steps.map(s => s.target))];
  }

  /** Group steps by action type for batch execution. */
  groupByAction(): Map<RepairAction, RepairStep[]> {
    const groups = new Map<RepairAction, RepairStep[]>();
    for (const step of this.steps) {
      if (!groups.has(step.action)) groups.set(step.action, []);
      groups.get(step.action)!.push(step);
    }
    return groups;
  }
}
