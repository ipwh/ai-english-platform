// Sprint 13: AI Usage Report Generator
import { getCostSummary, getModelPricing } from './cost-tracker';
import type { CostSummary } from './types';

/** Generate a human-readable AI usage report */
export function generateReport(days?: number): string {
  const summary = getCostSummary(days);
  const pricing = getModelPricing();

  const lines: string[] = [
    '═══════════════════════════════════════',
    '       AI Usage Report',
    `       ${days ? `Last ${days} days` : 'All time'}`,
    '═══════════════════════════════════════',
    '',
    `Total Requests:    ${summary.totalRequests}`,
    `Cached:            ${summary.cachedRequests} (${Math.round(summary.cacheHitRate * 100)}%)`,
    `Batched:           ${summary.batchedRequests}`,
    '',
    `Total Tokens:      ${summary.totalTokens.totalTokens.toLocaleString()}`,
    `  Prompt:          ${summary.totalTokens.promptTokens.toLocaleString()}`,
    `  Completion:      ${summary.totalTokens.completionTokens.toLocaleString()}`,
    '',
    `Total Cost:        $${summary.totalCostUSD.toFixed(4)}`,
    `Cache Savings:     $${summary.estimatedSavingsUSD.toFixed(4)}`,
    '',
    '--- By Model ---',
  ];

  for (const [model, data] of Object.entries(summary.byModel)) {
    const p = pricing[model as keyof typeof pricing];
    lines.push(`  ${model}: ${data.requests} req, $${data.costUSD.toFixed(4)}, ${data.tokens.totalTokens.toLocaleString()} tokens`);
    if (p) lines.push(`    (in: $${p.inputPricePer1K}/1K, out: $${p.outputPricePer1K}/1K)`);
  }

  if (Object.keys(summary.byDay).length > 0) {
    lines.push('', '--- By Day ---');
    for (const [day, data] of Object.entries(summary.byDay).sort().reverse()) {
      lines.push(`  ${day}: ${data.requests} req, $${data.costUSD.toFixed(4)}`);
    }
  }

  lines.push('', '═══════════════════════════════════════');
  return lines.join('\n');
}

/** Generate a compact one-line summary */
export function quickSummary(days?: number): string {
  const s = getCostSummary(days);
  return `${s.totalRequests} req | $${s.totalCostUSD.toFixed(3)} | ${s.totalTokens.totalTokens.toLocaleString()} tokens | ${Math.round(s.cacheHitRate * 100)}% cached`;
}

/** Generate cost projection for estimated monthly usage */
export function projectMonthlyCost(
  estimatedDailyRequests: number,
  avgPromptTokens: number,
  avgCompletionTokens: number,
  cacheRate: number
): Record<string, { monthlyCost: number; monthlyTokens: number }> {
  const pricing = getModelPricing();
  const effectiveRequests = estimatedDailyRequests * (1 - cacheRate);

  const result: Record<string, { monthlyCost: number; monthlyTokens: number }> = {};
  for (const [model, p] of Object.entries(pricing)) {
    const dailyCost = effectiveRequests * (
      (avgPromptTokens / 1000) * p.inputPricePer1K +
      (avgCompletionTokens / 1000) * p.outputPricePer1K
    );
    result[model] = {
      monthlyCost: Math.round(dailyCost * 30 * 100) / 100,
      monthlyTokens: effectiveRequests * (avgPromptTokens + avgCompletionTokens) * 30,
    };
  }
  return result;
}
