// Sprint 13: Cost Tracker — token estimation + cost calculation
import type { AIModel, TokenUsage, CostEntry, ModelPricing, CostSummary } from './types';
import { logger } from '@/shared/logger/logger';

// ============================================
// Model Pricing (USD per 1000 tokens)
// ============================================

// DeepSeek rates (docs 2026-09-14) converted at 7.1 CNY/USD, off-peak (空閒時段) prices:
//   deepseek-flash  : 1 CNY / M input (cache miss) | 4 CNY / M output
//   deepseek-v4-pro : 4.5 CNY / M input            | 13.5 CNY / M output
// Peak hours (Beijing Mon-Fri 09:00-12:00, 14:00-18:00) are billed at 2× these rates.
const PRICING: Record<AIModel, ModelPricing> = {
  'deepseek-flash': { model: 'deepseek-flash', inputPricePer1K: 0.00014, outputPricePer1K: 0.00056 },
  'deepseek-v4-pro': { model: 'deepseek-v4-pro', inputPricePer1K: 0.00063, outputPricePer1K: 0.00190 },
  // Retired alias — served by V4.1-Flash and billed as Flash.
  'deepseek-v4-flash': { model: 'deepseek-v4-flash', inputPricePer1K: 0.00014, outputPricePer1K: 0.00056 },
  // Retired 2026-07-24 — retained for historical cost entries/reports only.
  'deepseek-chat': { model: 'deepseek-chat', inputPricePer1K: 0.00014, outputPricePer1K: 0.00028 },
  'deepseek-reasoner': { model: 'deepseek-reasoner', inputPricePer1K: 0.00055, outputPricePer1K: 0.00219 },
  'gemini-2.0-flash': { model: 'gemini-2.0-flash', inputPricePer1K: 0.00010, outputPricePer1K: 0.00040 },
  'gemini-2.5-flash': { model: 'gemini-2.5-flash', inputPricePer1K: 0.00015, outputPricePer1K: 0.00060 },
  'gemini-2.5-flash-lite': { model: 'gemini-2.5-flash-lite', inputPricePer1K: 0.00010, outputPricePer1K: 0.00040 },
  'grok-4.3': { model: 'grok-4.3', inputPricePer1K: 0.00125, outputPricePer1K: 0.00250 },
  'vertex-gemini': { model: 'vertex-gemini', inputPricePer1K: 0.0000375, outputPricePer1K: 0.00015 },
};

// ============================================
// Token Estimation
// ============================================

/** Estimate tokens for a text string. English: ~4 chars/token, Chinese: ~1.5 chars/token */
export function estimateTokens(text: string): number {
  const cnChars = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
  const enChars = text.length - cnChars;
  return Math.ceil(cnChars / 1.5 + enChars / 4);
}

/** Estimate token usage for a prompt + completion pair */
export function estimateUsage(prompt: string, completion?: string): TokenUsage {
  const promptTokens = estimateTokens(prompt);
  const completionTokens = completion ? estimateTokens(completion) : Math.ceil(promptTokens * 0.3); // Rough estimate
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

// ============================================
// Cost Calculation
// ============================================

/** Calculate cost for a given token usage and model */
export function calculateCost(model: AIModel, usage: TokenUsage): number {
  const pricing = PRICING[model];
  return (usage.promptTokens / 1000) * pricing.inputPricePer1K +
         (usage.completionTokens / 1000) * pricing.outputPricePer1K;
}

// ============================================
// Cost Tracking Store
// ============================================

const entries: CostEntry[] = [];
let entryCounter = 0;

/** Record a cost entry */
export function recordCost(params: {
  model: AIModel;
  prompt: string;
  completion?: string;
  promptHash: string;
  cached?: boolean;
  batched?: boolean;
  actualUsage?: TokenUsage;
}): CostEntry {
  const usage = params.actualUsage ?? estimateUsage(params.prompt, params.completion);
  const cost = calculateCost(params.model, usage);

  const entry: CostEntry = {
    id: `cost_${Date.now()}_${++entryCounter}`,
    model: params.model,
    timestamp: new Date(),
    promptHash: params.promptHash,
    tokenUsage: usage,
    costUSD: Math.round(cost * 1000000) / 1000000, // Round to 6 decimal places
    cached: params.cached ?? false,
    batched: params.batched ?? false,
  };

  entries.push(entry);
  logger.debug({ module: 'cost-tracker', model: params.model, cost: entry.costUSD, tokens: usage.totalTokens, cached: entry.cached }, 'Cost recorded');
  return entry;
}

// ============================================
// Summary / Reporting
// ============================================

/** Generate cost summary from recorded entries */
export function getCostSummary(days?: number): CostSummary {
  const now = Date.now();
  const cutoff = days ? now - days * 86400000 : 0;

  const filtered = entries.filter(e => e.timestamp.getTime() >= cutoff);
  const cached = filtered.filter(e => e.cached);
  const batched = filtered.filter(e => e.batched);

  const totalCost = filtered.reduce((sum, e) => sum + e.costUSD, 0);
  const totalTokens: TokenUsage = filtered.reduce(
    (acc, e) => ({
      promptTokens: acc.promptTokens + e.tokenUsage.promptTokens,
      completionTokens: acc.completionTokens + e.tokenUsage.completionTokens,
      totalTokens: acc.totalTokens + e.tokenUsage.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );

  // Savings: if cached entries had been actual API calls
  const savingsFromCache = cached.reduce((sum, e) => sum + e.costUSD, 0);

  // By model
  const byModel: Record<string, { requests: number; costUSD: number; tokens: TokenUsage }> = {};
  for (const e of filtered) {
    if (!byModel[e.model]) byModel[e.model] = { requests: 0, costUSD: 0, tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    byModel[e.model].requests++;
    byModel[e.model].costUSD += e.costUSD;
    byModel[e.model].tokens.promptTokens += e.tokenUsage.promptTokens;
    byModel[e.model].tokens.completionTokens += e.tokenUsage.completionTokens;
    byModel[e.model].tokens.totalTokens += e.tokenUsage.totalTokens;
  }

  // By day
  const byDay: Record<string, { requests: number; costUSD: number }> = {};
  for (const e of filtered) {
    const day = e.timestamp.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { requests: 0, costUSD: 0 };
    byDay[day].requests++;
    byDay[day].costUSD += e.costUSD;
  }

  return {
    totalCostUSD: Math.round(totalCost * 10000) / 10000,
    totalTokens,
    totalRequests: filtered.length,
    cachedRequests: cached.length,
    batchedRequests: batched.length,
    cacheHitRate: filtered.length > 0 ? Math.round((cached.length / filtered.length) * 100) / 100 : 0,
    estimatedSavingsUSD: Math.round(savingsFromCache * 1000000) / 1000000,
    byModel,
    byDay,
  };
}

/** Get pricing for all models */
export function getModelPricing(): Record<AIModel, ModelPricing> {
  return { ...PRICING };
}

/** Get all cost entries */
export function getEntries(): CostEntry[] { return [...entries]; }

/** Clear all entries (for testing) */
export function clearEntries(): void { entries.length = 0; entryCounter = 0; }

/** Compare two models' cost for the same estimated usage */
export function compareCost(usage: TokenUsage): Record<AIModel, number> {
  return Object.keys(PRICING).reduce((acc, model) => {
    acc[model as AIModel] = Math.round(calculateCost(model as AIModel, usage) * 1000000) / 1000000;
    return acc;
  }, {} as Record<AIModel, number>);
}
