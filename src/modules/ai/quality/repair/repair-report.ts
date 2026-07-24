// ============================================
// Sprint 104: Repair Report
// Generates structured repair summary from pipeline results.
// ============================================

import type { RepairPipelineResult } from './repair-pipeline';
import type { RepairPlan } from './repair-plan';
import { getRepairMetrics } from './repair-metrics';
import { getRepairHistory } from './repair-history';
import { getBudgetUsage, type RepairBudget } from './repair-budget';

export interface RepairReport {
  summary: {
    approved: boolean;
    repairsApplied: number;
    patchesApplied: number;
    regenerationsUsed: number;
    repairDurationMs: number;
    initialScore: number;
    finalScore: number;
    improvement: number;
  };
  plan?: {
    steps: number;
    estimatedCost: string;
    requiresLLM: boolean;
    targetFields: string[];
    actions: Array<{ ruleId: string; action: string; target: string }>;
  };
  budget: ReturnType<typeof getBudgetUsage>;
  metrics: ReturnType<typeof getRepairMetrics>;
  recentHistory: ReturnType<typeof getRepairHistory>;
}

/** Generate a comprehensive repair report from pipeline results. */
export function generateRepairReport<T>(
  result: RepairPipelineResult<T>,
  budget?: RepairBudget,
): RepairReport {
  return {
    summary: {
      approved: result.approved,
      repairsApplied: result.plan?.stepCount ?? 0,
      patchesApplied: budget?.patchCount ?? 0,
      regenerationsUsed: budget?.regenerationCount ?? 0,
      repairDurationMs: budget ? (Date.now() - budget.startTime) : 0,
      initialScore: result.initialQuality.score,
      finalScore: result.finalQuality?.score ?? result.initialQuality.score,
      improvement: (result.finalQuality?.score ?? result.initialQuality.score) - result.initialQuality.score,
    },
    plan: result.plan ? {
      steps: result.plan.stepCount,
      estimatedCost: result.plan.estimatedCost,
      requiresLLM: result.plan.requiresLLM,
      targetFields: result.plan.targetFields,
      actions: result.plan.steps.map(s => ({
        ruleId: s.ruleId,
        action: s.action,
        target: s.target,
      })),
    } : undefined,
    budget: result.budget,
    metrics: getRepairMetrics(),
    recentHistory: getRepairHistory(10),
  };
}

/** Generate a human-readable repair summary string. */
export function formatRepairSummary(result: RepairPipelineResult): string {
  const parts = [
    result.approved ? '✅ APPROVED' : '❌ REJECTED',
    `Score: ${result.initialQuality.score} → ${result.finalQuality?.score ?? 'N/A'}`,
    `Repairs: ${result.plan?.stepCount ?? 0} applied`,
    `Budget: ${result.budget.patchCount}/${result.budget.patchBudgetRemaining + result.budget.patchCount} patches`,
  ];
  return parts.join(' | ');
}
