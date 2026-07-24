// ============================================
// Sprint 104: Repair Metrics
// Tracks repair operations, success rates, and performance.
// ============================================

import { RepairAction } from './repair-action';

interface RepairMetric {
  attempts: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
}

const metrics = new Map<string, RepairMetric>();

const overall = {
  totalPatches: 0,
  totalRegenerations: 0,
  totalRejects: 0,
  budgetExceededCount: 0,
};

function ensureMetric(key: string): RepairMetric {
  if (!metrics.has(key)) {
    metrics.set(key, { attempts: 0, successes: 0, failures: 0, totalDurationMs: 0 });
  }
  return metrics.get(key)!;
}

/** Record a repair attempt. */
export function recordRepairAttempt(action: RepairAction | string, durationMs: number): void {
  const m = ensureMetric(action);
  m.attempts++;
  m.totalDurationMs += durationMs;
}

/** Record a successful repair. */
export function recordRepairSuccess(action: RepairAction | string): void {
  const m = ensureMetric(action);
  m.successes++;
  if (action === 'REGENERATE_FIELD' || action === 'REGENERATE_QUESTION') {
    overall.totalRegenerations++;
  } else if (action === RepairAction.REJECT) {
    overall.totalRejects++;
  } else {
    overall.totalPatches++;
  }
}

/** Record a failed repair. */
export function recordRepairFailure(action: RepairAction | string): void {
  const m = ensureMetric(action);
  m.attempts++;
  m.failures++;
}

/** Record budget exceeded. */
export function recordBudgetExceeded(): void {
  overall.budgetExceededCount++;
}

/** Get comprehensive repair metrics. */
export function getRepairMetrics() {
  const perAction = Array.from(metrics.entries()).map(([action, m]) => ({
    action,
    attempts: m.attempts,
    successes: m.successes,
    failures: m.failures,
    successRate: m.attempts > 0 ? Math.round((m.successes / m.attempts) * 100) / 100 : 0,
    avgDurationMs: m.attempts > 0 ? Math.round(m.totalDurationMs / m.attempts) : 0,
  })).sort((a, b) => b.attempts - a.attempts);

  const totalAttempts = perAction.reduce((s, a) => s + a.attempts, 0);
  const totalSuccesses = perAction.reduce((s, a) => s + a.successes, 0);

  return {
    totalRepairs: totalAttempts,
    totalSuccesses,
    successRate: totalAttempts > 0 ? Math.round((totalSuccesses / totalAttempts) * 100) / 100 : 0,
    failureRate: totalAttempts > 0 ? Math.round(((totalAttempts - totalSuccesses) / totalAttempts) * 100) / 100 : 0,
    totalPatches: overall.totalPatches,
    totalRegenerations: overall.totalRegenerations,
    totalRejects: overall.totalRejects,
    budgetExceededCount: overall.budgetExceededCount,
    avgRepairTimeMs: totalAttempts > 0
      ? Math.round(Array.from(metrics.values()).reduce((s, m) => s + m.totalDurationMs, 0) / totalAttempts)
      : 0,
    perAction,
    topRepairActions: perAction.slice(0, 5).map(a => a.action),
  };
}

/** Reset all repair metrics. */
export function resetRepairMetrics(): void {
  metrics.clear();
  overall.totalPatches = 0;
  overall.totalRegenerations = 0;
  overall.totalRejects = 0;
  overall.budgetExceededCount = 0;
}
