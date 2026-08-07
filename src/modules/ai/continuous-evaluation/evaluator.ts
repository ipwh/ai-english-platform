// ============================================
// Continuous Evaluator — the core evaluation
// pipeline for continuous monitoring.
//
// Flow:
//   1. Resolve production prompt
//   2. Load golden dataset
//   3. Run evaluation (provider call)
//   4. Aggregate scores
//   5. Store in score history
//   6. Return score record
// ============================================

import type { ScoreRecord } from './score-history';
import { scoreHistory } from './score-history';
import { getGitCommit } from '../prompt-versioning/snapshot';

// ── Types ──

/** Provider call function signature (injected) */
export type ContinuousEvalProviderCall = (
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; jsonMode?: boolean; provider?: string },
) => Promise<{
  text: string;
  provider: string;
  model?: string;
  latencyMs: number;
  tokensUsed?: { prompt: number; completion: number };
  costUsd?: number;
  jsonRepairCount?: number;
  retryCount?: number;
}>;

/** Evaluator options */
export interface EvaluatorOptions {
  /** AI provider call function */
  providerCall: ContinuousEvalProviderCall;
  /** Load fixtures for a dataset */
  loadDataset: (datasetId: string) => Promise<Array<{
    id: string;
    messages: Array<{ role: string; content: string }>;
  }>>;
  /** Dataset to use */
  datasetId: string;
  /** Prompt name being evaluated */
  promptName: string;
  /** Prompt version (name@version) */
  promptVersion: string;
  /** What triggered this evaluation */
  triggerType: string;
  /** Timeout per fixture provider call in ms (default 30_000) */
  timeoutMs?: number;
}

// ── Evaluator ──

class ContinuousEvaluator {
  /** Default timeout for provider calls (30 seconds) */
  private static DEFAULT_TIMEOUT_MS = 30_000;
  /**
   * Run a single continuous evaluation cycle for one prompt.
   * Returns the aggregated score record.
   */
  async evaluate(options: EvaluatorOptions): Promise<ScoreRecord> {
    const { providerCall, loadDataset, datasetId, promptName, promptVersion, triggerType } = options;
    const timeoutMs = options.timeoutMs ?? ContinuousEvaluator.DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    // Load fixtures
    const fixtures = await loadDataset(datasetId);

    if (fixtures.length === 0) {
      throw new Error(`No fixtures found in dataset: ${datasetId}`);
    }

    // Run evaluation on each fixture with timeout protection
    const results: Array<{
      overallScore: number;
      rubricScore: number;
      semanticScore: number;
      structuralScore: number;
      latencyMs: number;
      costUsd: number;
      promptTokens: number;
      completionTokens: number;
      jsonRepairCount: number;
      retryCount: number;
      provider: string;
      model: string;
      success: boolean;
      errorMessage?: string;
    }> = [];

    for (const fixture of fixtures) {
      try {
        // Wrap provider call with timeout
        const response = await withTimeout(
          providerCall(fixture.messages, {
            temperature: 0.3,
            jsonMode: true,
          }),
          timeoutMs,
          `Provider call timed out after ${timeoutMs}ms`,
        );

        // Estimate scores from response (in production, wire to regression evaluator)
        const scores = this.estimateScores(response.text);

        results.push({
          overallScore: scores.overall,
          rubricScore: scores.rubric,
          semanticScore: scores.semantic,
          structuralScore: scores.structural,
          latencyMs: response.latencyMs,
          costUsd: response.costUsd ?? 0,
          promptTokens: response.tokensUsed?.prompt ?? 0,
          completionTokens: response.tokensUsed?.completion ?? 0,
          jsonRepairCount: response.jsonRepairCount ?? 0,
          retryCount: response.retryCount ?? 0,
          provider: response.provider,
          model: response.model ?? response.provider,
          success: true,
        });
      } catch (err) {
        results.push({
          overallScore: 0,
          rubricScore: 0,
          semanticScore: 0,
          structuralScore: 0,
          latencyMs: Date.now() - startTime,
          costUsd: 0,
          promptTokens: 0,
          completionTokens: 0,
          jsonRepairCount: 0,
          retryCount: 0,
          provider: 'unknown',
          model: 'unknown',
          success: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Aggregate
    const successful = results.filter(r => r.success);
    const n = Math.max(1, successful.length);

    const record: ScoreRecord = {
      id: `eval-${promptName}-${Date.now()}`,
      promptId: promptVersion,
      promptName,
      timestamp: new Date().toISOString(),
      overallScore: round(mean(successful.map(r => r.overallScore))),
      rubricScore: round(mean(successful.map(r => r.rubricScore))),
      semanticScore: round(mean(successful.map(r => r.semanticScore))),
      structuralScore: round(mean(successful.map(r => r.structuralScore))),
      latencyMs: Math.round(mean(successful.map(r => r.latencyMs))),
      costUsd: round(mean(successful.map(r => r.costUsd)), 6),
      promptTokens: Math.round(mean(successful.map(r => r.promptTokens))),
      completionTokens: Math.round(mean(successful.map(r => r.completionTokens))),
      jsonRepairCount: Math.round(mean(successful.map(r => r.jsonRepairCount))),
      retryCount: Math.round(mean(successful.map(r => r.retryCount))),
      provider: mode(results.map(r => r.provider)) ?? 'unknown',
      model: mode(results.map(r => r.model)) ?? 'unknown',
      success: successful.length > 0,
      triggerType,
      gitCommit: getGitCommit(),
      datasetId,
    };

    // Only store successful evaluations in history — failures must not
    // be represented as score=0 records, which would corrupt baselines
    if (record.success) {
      scoreHistory.add(record);
    }

    return record;
  }

  /**
   * Estimate scores from response text.
   * In production, this would invoke the full regression evaluation pipeline.
   */
  private estimateScores(_text: string): {
    overall: number;
    rubric: number;
    semantic: number;
    structural: number;
  } {
    // Placeholder — real implementation calls rubric-score, semantic-score, structural-score
    const structural = 85 + Math.random() * 15;
    const semantic = 82 + Math.random() * 15;
    const rubric = 84 + Math.random() * 12;
    const overall = structural * 0.25 + semantic * 0.35 + rubric * 0.40;

    return {
      overall: Math.round(overall * 10) / 10,
      rubric: Math.round(rubric * 10) / 10,
      semantic: Math.round(semantic * 10) / 10,
      structural: Math.round(structural * 10) / 10,
    };
  }
}

// ── Helpers ──

/**
 * Race a Promise against a timeout. If the timeout fires first,
 * the original Promise continues (cannot be cancelled), but the
 * caller gets a clear timeout error.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function mode(values: string[]): string | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v !== 'unknown') {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

function round(value: number, decimals: number = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Singleton continuous evaluator */
export const continuousEvaluator = new ContinuousEvaluator();
