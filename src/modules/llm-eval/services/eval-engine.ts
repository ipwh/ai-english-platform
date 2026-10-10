// Sprint 28: LLM Evaluation Engine — benchmark, compare, report
import type {
  EvalMetrics, EvalRun, EvalReport,
  PromptBenchmark, ModelBenchmark,
  PromptVersionComparison, ProviderComparison,
  EvalHistory, EvalMetric,
} from '../types';

// ============================================
// In-memory evaluation store
// ============================================

const evalHistory: EvalRun[] = [];
const evalReports: EvalReport[] = [];

// ============================================
// Metric Calculators
// ============================================

/** Calculate hallucination risk (0-1) based on output patterns */
export function calcHallucinationRisk(output: string, expectedOutput?: string): number {
  let risk = 0;
  // Fabricated facts: very specific numbers/dates not in context
  if (/\b\d{4}\b/g.test(output) && expectedOutput && !expectedOutput.match(/\b\d{4}\b/)) risk += 0.2;
  // Overly confident made-up claims
  if (/it is (certainly|undoubtedly|absolutely|definitely) true that/i.test(output)) risk += 0.15;
  // Contradiction markers
  if (/although.*however|on one hand.*on the other hand.*but actually/i.test(output)) risk += 0.1;
  // Made-up references
  if (/according to (the|a) (study|research|report|survey) (by|from|conducted by)/i.test(output)) risk += 0.2;
  // Inconsistent statistics
  const numbers = output.match(/\d+(\.\d+)?%?/g) || [];
  if (numbers.length > 5) risk += 0.1;
  // Output too short to evaluate meaningfully
  if (output.length < 20) risk += 0.3;
  return Math.min(1, Math.round(risk * 100) / 100);
}

/** Calculate consistency (0-1) between multiple outputs for the same input */
export function calcConsistency(outputs: string[]): number {
  if (outputs.length < 2) return 0.5;
  let totalSimilarity = 0;
  let pairs = 0;
  for (let i = 0; i < outputs.length; i++) {
    for (let j = i + 1; j < outputs.length; j++) {
      totalSimilarity += stringSimilarity(outputs[i], outputs[j]);
      pairs++;
    }
  }
  return pairs > 0 ? Math.round((totalSimilarity / pairs) * 100) / 100 : 0;
}

/** Calculate JSON validity (0-1) */
export function calcJsonValidity(output: string): number {
  // Try parsing as JSON directly
  try { JSON.parse(output); return 1; } catch { /* valid JSON → 1 */ }
  // Try extracting JSON from markdown code blocks
  const mdMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (mdMatch) {
    try { JSON.parse(mdMatch[1]); return 0.9; } catch { /* markdown JSON → 0.9 */ }
  }
  // Try finding JSON objects/arrays
  const jsonMatch = output.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try { JSON.parse(jsonMatch[0]); return 0.7; } catch { /* partial JSON → 0.7 */ }
  }
  // Partial JSON: count balanced brackets
  const openBraces = (output.match(/\{/g) || []).length;
  const closeBraces = (output.match(/\}/g) || []).length;
  if (openBraces > 0 && openBraces === closeBraces) return 0.4;
  if (openBraces > 0) return 0.2;
  return 0;
}

/** Calculate rubric score (0-100) based on HKDSE-style criteria */
export function calcRubricScore(output: string, expectedOutput?: string): number {
  let score = 50;
  // Length adequacy
  if (output.length > 200) score += 10;
  if (output.length > 500) score += 5;
  // Structure (paragraphs)
  if (output.split(/\n\n+/).length >= 3) score += 5;
  // Grammar indicators
  const complexStructures = output.match(/\b(although|despite|whereas|furthermore|consequently|nevertheless|therefore)\b/gi);
  if (complexStructures && complexStructures.length >= 2) score += 5;
  // Vocabulary
  if (new Set(output.split(/\s+/).map(w => w.toLowerCase())).size > 50) score += 5;
  // If expected output provided, check similarity
  if (expectedOutput) {
    const similarity = stringSimilarity(output, expectedOutput);
    score += Math.round(similarity * 20);
  }
  // Penalize very short or repetitive
  if (output.length < 50) score -= 20;
  if (output.split(/\s+/).length < 10) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function stringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

// ============================================
// Evaluation Engine
// ============================================

export function runEval(input: string, output: string, expectedOutput?: string, durationMs = 0, costUsd = 0): EvalRun {
  const metrics: EvalMetrics = {
    latencyMs: durationMs,
    costUsd: Math.round(costUsd * 1000000) / 1000000,
    hallucinationRisk: calcHallucinationRisk(output, expectedOutput),
    consistency: 0.5, // Single run, no comparison possible
    jsonValidity: calcJsonValidity(output),
    rubricScore: calcRubricScore(output, expectedOutput),
  };

  const run: EvalRun = {
    runId: `eval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    input, expectedOutput, metrics, rawOutput: output, durationMs,
  };

  evalHistory.push(run);
  return run;
}

/** Run consistency evaluation across multiple outputs */
export function runConsistencyEval(input: string, outputs: string[], expectedOutput?: string): EvalMetrics {
  const avgDuration = 0;
  const avgCost = 0;
  return {
    latencyMs: avgDuration,
    costUsd: avgCost,
    hallucinationRisk: Math.round(outputs.reduce((s, o) => s + calcHallucinationRisk(o, expectedOutput), 0) / outputs.length * 100) / 100,
    consistency: calcConsistency(outputs),
    jsonValidity: Math.round(outputs.reduce((s, o) => s + calcJsonValidity(o), 0) / outputs.length * 100) / 100,
    rubricScore: Math.round(outputs.reduce((s, o) => s + calcRubricScore(o, expectedOutput), 0) / outputs.length),
  };
}

// ============================================
// Benchmarking
// ============================================

export function benchmarkPrompt(
  promptId: string, promptName: string, version: string,
  provider: string, model: string, metrics: EvalMetrics, issues: string[],
): PromptBenchmark {
  return {
    promptId, promptName, version, provider, model, metrics,
    passed: issues.length === 0 && metrics.jsonValidity >= 0.7 && metrics.rubricScore >= 50,
    issues, timestamp: new Date().toISOString(),
  };
}

export function benchmarkModel(
  modelId: string, modelName: string, provider: string, metrics: EvalMetrics,
  strengths: string[], weaknesses: string[],
): ModelBenchmark {
  return {
    modelId, modelName, provider, metrics,
    rank: 0, // Set after sorting
    strengths, weaknesses, timestamp: new Date().toISOString(),
  };
}

export function rankModels(models: ModelBenchmark[]): ModelBenchmark[] {
  const scored = models.map(m => ({
    ...m,
    _score: m.metrics.rubricScore * 0.4 + m.metrics.jsonValidity * 100 * 0.2 +
            (1 - m.metrics.hallucinationRisk) * 100 * 0.25 + m.metrics.consistency * 100 * 0.15 -
            m.metrics.latencyMs / 100 - m.metrics.costUsd * 100000,
  }));
  scored.sort((a, b) => b._score - a._score);
  return scored.map((m, i) => ({ ...m, rank: i + 1 }));
}

// ============================================
// Comparisons
// ============================================

export function comparePromptVersions(
  baseline: EvalMetrics, candidate: EvalMetrics,
  baselineId: string, candidateId: string,
  baselineVersion: string, candidateVersion: string,
): PromptVersionComparison {
  const metricsDiff = {} as PromptVersionComparison['metricsDiff'];
  let improvements = 0, regressions = 0;

  const metricKeys: Array<{ key: keyof EvalMetrics; lowerIsBetter: boolean }> = [
    { key: 'latencyMs', lowerIsBetter: true },
    { key: 'costUsd', lowerIsBetter: true },
    { key: 'hallucinationRisk', lowerIsBetter: true },
    { key: 'consistency', lowerIsBetter: false },
    { key: 'jsonValidity', lowerIsBetter: false },
    { key: 'rubricScore', lowerIsBetter: false },
  ];

  for (const { key, lowerIsBetter } of metricKeys) {
    const before = baseline[key];
    const after = candidate[key];
    const change = after - before;
    const improved = lowerIsBetter ? change < 0 : change > 0;
    if (improved) improvements++; else if (change !== 0) regressions++;

    const metricKey = key === 'latencyMs' ? 'latency' : key === 'costUsd' ? 'cost' :
      key === 'hallucinationRisk' ? 'hallucination_risk' : key === 'jsonValidity' ? 'json_validity' :
      key === 'rubricScore' ? 'rubric_score' : 'consistency';

    metricsDiff[metricKey as EvalMetric] = {
      before: Math.round(before * 1000) / 1000,
      after: Math.round(after * 1000) / 1000,
      change: Math.round(change * 1000) / 1000,
      improved,
    };
  }

  return {
    baselineId, candidateId, baselineVersion, candidateVersion,
    metricsDiff,
    winner: improvements > regressions ? candidateId : baselineId,
    confidence: Math.round(Math.abs(improvements - regressions) / 6 * 100) / 100,
  };
}

export function compareProviders(
  providerMetrics: Record<string, EvalMetrics>,
): ProviderComparison {
  const providers = Object.keys(providerMetrics);
  const rankings = providers.map(provider => {
    const m = providerMetrics[provider];
    const overallScore = m.rubricScore * 0.35 + (1 - m.hallucinationRisk) * 100 * 0.25 +
                         m.jsonValidity * 100 * 0.15 + m.consistency * 100 * 0.15 -
                         m.latencyMs / 50 - m.costUsd * 50000;
    return { provider, overallScore: Math.round(overallScore * 10) / 10, rank: 0 };
  });
  rankings.sort((a, b) => b.overallScore - a.overallScore);
  rankings.forEach((r, i) => r.rank = i + 1);

  const bestFor: Record<string, string> = {};
  const metrics: Array<{ name: string; key: keyof EvalMetrics; lowerBetter: boolean }> = [
    { name: 'latency', key: 'latencyMs', lowerBetter: true },
    { name: 'cost', key: 'costUsd', lowerBetter: true },
    { name: 'hallucination_risk', key: 'hallucinationRisk', lowerBetter: true },
    { name: 'consistency', key: 'consistency', lowerBetter: false },
    { name: 'json_validity', key: 'jsonValidity', lowerBetter: false },
    { name: 'rubric_score', key: 'rubricScore', lowerBetter: false },
  ];

  for (const { name, key, lowerBetter } of metrics) {
    let best = providers[0];
    for (const p of providers) {
      if (lowerBetter ? providerMetrics[p][key] < providerMetrics[best][key]
                      : providerMetrics[p][key] > providerMetrics[best][key]) {
        best = p;
      }
    }
    bestFor[name] = best;
  }

  return { providers, metrics: providerMetrics, rankings, bestFor, timestamp: new Date().toISOString() };
}

// ============================================
// Report Generation
// ============================================

export function generateReport(
  type: EvalReport['type'], results: EvalRun[], title: string,
): EvalReport {
  const avgMetrics = averageMetrics(results);
  const summary = `Evaluated ${results.length} runs. Avg rubric: ${avgMetrics.rubricScore}/100, Hallucination risk: ${Math.round(avgMetrics.hallucinationRisk * 100)}%, JSON validity: ${Math.round(avgMetrics.jsonValidity * 100)}%`;
  const summaryZh = `已評估 ${results.length} 次運行。平均評分：${avgMetrics.rubricScore}/100，幻覺風險：${Math.round(avgMetrics.hallucinationRisk * 100)}%，JSON 有效性：${Math.round(avgMetrics.jsonValidity * 100)}%`;

  const report: EvalReport = {
    id: `report_${Date.now()}`,
    title, generatedAt: new Date().toISOString(), type,
    summary, summaryZh,
    results,
    recommendations: [],
    recommendationsZh: [],
  };

  if (avgMetrics.hallucinationRisk > 0.3) {
    report.recommendations.push('Consider adding more context constraints to reduce hallucination');
    report.recommendationsZh.push('考慮加入更多上下文限制以減少幻覺');
  }
  if (avgMetrics.jsonValidity < 0.7) {
    report.recommendations.push('Improve JSON output instructions in system prompt');
    report.recommendationsZh.push('改善系統提示中的 JSON 輸出指示');
  }
  if (avgMetrics.rubricScore < 50) {
    report.recommendations.push('Review output quality — rubric scores are below threshold');
    report.recommendationsZh.push('檢視輸出品質 — 評分低於門檻');
  }

  evalReports.push(report);
  return report;
}

export function getEvalHistory(): EvalHistory {
  return {
    runs: evalHistory,
    reports: evalReports,
    totalRuns: evalHistory.length,
    averageMetrics: averageMetrics(evalHistory),
  };
}

function averageMetrics(runs: EvalRun[]): EvalMetrics {
  if (runs.length === 0) return { latencyMs: 0, costUsd: 0, hallucinationRisk: 0, consistency: 0, jsonValidity: 0, rubricScore: 0 };
  const n = runs.length;
  return {
    latencyMs: Math.round(runs.reduce((s, r) => s + r.metrics.latencyMs, 0) / n),
    costUsd: Math.round(runs.reduce((s, r) => s + r.metrics.costUsd, 0) / n * 1000000) / 1000000,
    hallucinationRisk: Math.round(runs.reduce((s, r) => s + r.metrics.hallucinationRisk, 0) / n * 100) / 100,
    consistency: Math.round(runs.reduce((s, r) => s + r.metrics.consistency, 0) / n * 100) / 100,
    jsonValidity: Math.round(runs.reduce((s, r) => s + r.metrics.jsonValidity, 0) / n * 100) / 100,
    rubricScore: Math.round(runs.reduce((s, r) => s + r.metrics.rubricScore, 0) / n),
  };
}

export function clearEvalHistory(): void {
  evalHistory.length = 0;
  evalReports.length = 0;
}
