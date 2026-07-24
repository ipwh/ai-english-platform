// Sprint 98: Error Budget — tracks daily/weekly/monthly error consumption
import type { ErrorBudget, BudgetWindow } from './slo-types';
import { getRuntimeMetrics } from '@/modules/ai/services/runtime-metrics';

const budgets: Map<string, ErrorBudget> = new Map();

function createWindow(total: number, hours: number): BudgetWindow {
  return {
    total, consumed: 0, remaining: total,
    percentage: 100, isExceeded: false,
    resetAt: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
  };
}

export function consume(sloId: string, amount: number): void {
  let b = budgets.get(sloId);
  if (!b) {
    b = { sloId, daily: createWindow(100, 24), weekly: createWindow(700, 168), monthly: createWindow(3000, 720) };
    budgets.set(sloId, b);
  }
  for (const window of [b.daily, b.weekly, b.monthly] as BudgetWindow[]) {
    window.consumed = Math.min(window.total, window.consumed + amount);
    window.remaining = window.total - window.consumed;
    window.percentage = Math.round((window.remaining / window.total) * 100);
    window.isExceeded = window.consumed >= window.total;
  }
}

export function remaining(sloId: string): { daily: number; weekly: number; monthly: number } {
  const b = budgets.get(sloId);
  if (!b) return { daily: 100, weekly: 700, monthly: 3000 };
  return { daily: b.daily.remaining, weekly: b.weekly.remaining, monthly: b.monthly.remaining };
}

export function reset(sloId: string): void { budgets.delete(sloId); }

export function percentage(sloId: string): number {
  const b = budgets.get(sloId);
  if (!b) return 100;
  return b.monthly.percentage;
}

export function isExceeded(sloId: string): boolean {
  const b = budgets.get(sloId);
  if (!b) return false;
  return b.daily.isExceeded || b.weekly.isExceeded || b.monthly.isExceeded;
}

/** Get all error budgets, auto-initialize from runtime metrics */
export function getAllBudgets(): ErrorBudget[] {
  if (budgets.size === 0) {
    const m = getRuntimeMetrics();
    const errors = m.validationFailures || 0;
    consume('ai-availability', errors);
    consume('ai-success-rate', errors);
    consume('ai-latency', Math.round((m.avgLatencyMs || 0) / 10));
  }
  return Array.from(budgets.values());
}
