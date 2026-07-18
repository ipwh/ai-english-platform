// Sprint 13: AI Cost Optimization Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { estimateTokens, estimateUsage, calculateCost, recordCost, getCostSummary, clearEntries, compareCost } from '../cost-tracker';
import { hashPrompt, normalizePrompt, checkDuplicate, dedupCacheKey, detectBatchCandidates } from '../prompt-deduplicator';
import { generateReport, quickSummary, projectMonthlyCost } from '../usage-report';

beforeEach(() => { clearEntries(); });

// ============================================
// Cost Tracker Tests
// ============================================

describe('CostTracker', () => {
  it('should estimate tokens correctly', () => {
    const en = estimateTokens('Hello world this is a test');
    expect(en).toBeGreaterThan(0);
    expect(en).toBeLessThan(10);

    const cn = estimateTokens('你好世界這是一個測試');
    expect(cn).toBeGreaterThan(0);
    const mixed = estimateTokens('Hello 你好 world 世界');
    expect(mixed).toBeGreaterThan(0);
  });

  it('should calculate cost for DeepSeek', () => {
    const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
    const cost = calculateCost('deepseek-chat', usage);
    // 1000/1000 * 0.00014 + 500/1000 * 0.00028 = 0.00014 + 0.00014 = 0.00028
    expect(cost).toBeCloseTo(0.00028, 5);
  });

  it('should calculate cost for Gemini', () => {
    const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
    const cost = calculateCost('gemini-2.0-flash', usage);
    expect(cost).toBeCloseTo(0.00030, 5);
  });

  it('should record and summarize costs', () => {
    const longPrompt = 'This is a much longer prompt that will generate more tokens for cost estimation purposes';
    recordCost({ model: 'deepseek-chat', prompt: longPrompt, promptHash: 'abc', cached: false });
    recordCost({ model: 'deepseek-chat', prompt: longPrompt + ' variation', promptHash: 'def', cached: false });
    recordCost({ model: 'deepseek-chat', prompt: longPrompt + ' cached', promptHash: 'ghi', cached: true });

    const summary = getCostSummary();
    expect(summary.totalRequests).toBe(3);
    expect(summary.cachedRequests).toBe(1);
    expect(summary.cacheHitRate).toBeCloseTo(1 / 3);
    expect(summary.totalCostUSD).toBeGreaterThanOrEqual(0);
    expect(summary.estimatedSavingsUSD).toBeGreaterThanOrEqual(0);
  });

  it('should filter by days', () => {
    // All entries are from now, so filtering by 7 days should include them
    recordCost({ model: 'deepseek-chat', prompt: 'test', promptHash: 'abc' });
    const summary = getCostSummary(7);
    expect(summary.totalRequests).toBe(1);
  });

  it('should compare model costs', () => {
    const usage = { promptTokens: 100000, completionTokens: 50000, totalTokens: 150000 };
    const comparison = compareCost(usage);
    expect(comparison['deepseek-chat']).toBeGreaterThan(0);
    expect(comparison['vertex-gemini']).toBeLessThan(comparison['deepseek-chat']); // Vertex is cheaper
  });

  it('should estimate usage', () => {
    const usage = estimateUsage('Hello world prompt text here', 'Response text');
    expect(usage.promptTokens).toBeGreaterThan(0);
    expect(usage.completionTokens).toBeGreaterThan(0);
    expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
  });
});

// ============================================
// Prompt Deduplicator Tests
// ============================================

describe('PromptDeduplicator', () => {
  it('should hash prompts consistently', () => {
    const h1 = hashPrompt('test prompt');
    const h2 = hashPrompt('test prompt');
    expect(h1).toBe(h2);
    const h3 = hashPrompt('different prompt');
    expect(h1).not.toBe(h3);
  });

  it('should normalize prompts', () => {
    const n = normalizePrompt('  hello   world  \n\n test  ');
    expect(n).toBe('hello world test');
  });

  it('should detect duplicates', () => {
    const prompt = 'What is the capital of France?';
    recordCost({ model: 'deepseek-chat', prompt, promptHash: hashPrompt(normalizePrompt(prompt)) });

    const result = checkDuplicate(prompt, 'deepseek-chat');
    expect(result.isDuplicate).toBe(true);
  });

  it('should not flag different prompts as duplicates', () => {
    recordCost({ model: 'deepseek-chat', prompt: 'prompt A', promptHash: hashPrompt('prompt A') });

    const result = checkDuplicate('prompt B', 'deepseek-chat');
    expect(result.isDuplicate).toBe(false);
  });

  it('should generate cache keys', () => {
    const key = dedupCacheKey('deepseek-chat', 'test prompt');
    expect(key).toMatch(/^ai:dedup:deepseek-chat:/);
  });

  it('should detect batch candidates', () => {
    const prompts = [
      { prompt: 'Hello world test one. Additional text here for similarity matching.', model: 'deepseek-chat' as const },
      { prompt: 'Hello world test one. Additional text here for similarity matching with more.', model: 'deepseek-chat' as const },
      { prompt: 'Completely different prompt here for testing purposes.', model: 'deepseek-chat' as const },
    ];
    const batches = detectBatchCandidates(prompts);
    expect(batches.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================
// Usage Report Tests
// ============================================

describe('UsageReport', () => {
  it('should generate a report', () => {
    recordCost({ model: 'deepseek-chat', prompt: 'test', promptHash: 'abc', cached: false });
    recordCost({ model: 'gemini-2.0-flash', prompt: 'test2', promptHash: 'def', cached: true });

    const report = generateReport();
    expect(report).toContain('AI Usage Report');
    expect(report).toContain('deepseek-chat');
    expect(report).toContain('gemini-2.0-flash');
    expect(report).toContain('Total Cost');
  });

  it('should generate quick summary', () => {
    recordCost({ model: 'deepseek-chat', prompt: 'test', promptHash: 'abc' });
    const summary = quickSummary();
    expect(summary).toContain('req');
    expect(summary).toContain('$');
    expect(summary).toContain('tokens');
  });

  it('should project monthly costs', () => {
    const projection = projectMonthlyCost(100, 500, 200, 0.3);
    expect(projection['deepseek-chat']).toBeDefined();
    expect(projection['deepseek-chat'].monthlyCost).toBeGreaterThan(0);
    expect(projection['deepseek-chat'].monthlyTokens).toBeGreaterThan(0);
  });
});
