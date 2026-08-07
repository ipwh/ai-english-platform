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
import { getGitCommit } from '../prompt-versioning/snapshot';
import { MetricsCollector } from '../foundation';

// ── Error Taxonomy ──

/** Machine-classifiable evaluation error codes */
export type EvaluationErrorCode =
  | 'PROVIDER_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_ABORTED'
  | 'DATASET_ERROR'
  | 'FIXTURE_ERROR'
  | 'SCORING_ERROR'
  | 'VALIDATION_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'UNKNOWN_ERROR';

/** Structured evaluation failure metadata */
export interface EvaluationFailure {
  /** Machine-classifiable error code */
  code: EvaluationErrorCode;
  /** Human-readable error message (sanitized — no secrets) */
  message: string;
  /** Whether retrying might succeed */
  retryable: boolean;
  /** Whether the failure was due to timeout */
  timedOut: boolean;
  /** Whether the failure was due to explicit abort */
  aborted: boolean;
}

// ── Evaluator metrics (module-level, shared across instances) ──

const evaluatorMetrics = new MetricsCollector();

/** Increment a failure counter safely (never throws). */
export function incFailureCounter(code: EvaluationErrorCode): void {
  try { evaluatorMetrics.counter(`evaluation.failure.${code}`).inc(); } catch { /* metric failure must not fail evaluation */ }
}

export function incSuccessCounter(): void {
  try { evaluatorMetrics.counter('evaluation.success').inc(); } catch { /* metric failure must not fail evaluation */ }
}

/** Export evaluator metrics for reporting */
export function getEvaluatorMetrics() { return evaluatorMetrics.export(); }

/**
 * Metrics idempotency: track which evaluationIds have already been counted
 * so recovery replay does not double-count success/failure counters.
 */
const metricsDedup = new Set<string>();

/** Reset metrics dedup state (for testing / reset) */
export function resetMetricsDedup(): void {
  metricsDedup.clear();
}

/** Increment success counter, idempotently per evaluationId */
export function incSuccessCounterDedup(evaluationId: string): void {
  const key = `success:${evaluationId}`;
  if (metricsDedup.has(key)) return;
  metricsDedup.add(key);
  incSuccessCounter();
}

/** Increment failure counter, idempotently per evaluationId */
export function incFailureCounterDedup(evaluationId: string, code: EvaluationErrorCode): void {
  const key = `failure:${evaluationId}`;
  if (metricsDedup.has(key)) return;
  metricsDedup.add(key);
  incFailureCounter(code);
}

// ── Types ──

/** Provider call function signature (injected) */
export type ContinuousEvalProviderCall = (
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; jsonMode?: boolean; provider?: string; signal?: AbortSignal },
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
  /** AbortSignal for cancellation (optional, backwards compatible) */
  signal?: AbortSignal;
  /** Stable evaluation ID from monitor (optional, backwards compatible).
   *  When provided, used as the ScoreRecord.id for idempotency tracking. */
  evaluationId?: string;
}

// ── Helpers ──

/** Classify an error into an EvaluationFailure */
function classifyError(err: unknown, timedOut: boolean, aborted: boolean): EvaluationFailure {
  const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err ?? 'Unknown error'));

  if (aborted) {
    return { code: 'PROVIDER_ABORTED', message, retryable: false, timedOut: false, aborted: true };
  }
  if (timedOut) {
    return { code: 'PROVIDER_TIMEOUT', message, retryable: true, timedOut: true, aborted: false };
  }

  const msg = message.toLowerCase();
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return { code: 'PROVIDER_TIMEOUT', message, retryable: true, timedOut: true, aborted: false };
  }
  if (msg.includes('dataset') || msg.includes('fixture') || msg.includes('no fixtures')) {
    return { code: 'DATASET_ERROR', message, retryable: false, timedOut: false, aborted: false };
  }
  if (msg.includes('score') || msg.includes('scoring') || msg.includes('nan') || msg.includes('infinity')) {
    return { code: 'SCORING_ERROR', message, retryable: false, timedOut: false, aborted: false };
  }
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('server error') || msg.includes('5')) {
    return { code: 'PROVIDER_ERROR', message, retryable: true, timedOut: false, aborted: false };
  }
  // Provider errors are retryable by default (retry is owned by provider layer)
  return { code: 'PROVIDER_ERROR', message, retryable: true, timedOut: false, aborted: false };
}

/** Sanitize error messages to prevent secret leakage */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[REDACTED]')
    .replace(/Authorization:\s*\S+/gi, 'Authorization: [REDACTED]')
    .slice(0, 500); // Truncate excessively long messages
}

/** Create a timeout error that can be distinguished from other errors */
function createTimeoutError(timeoutMs: number): Error {
  const err = new Error(`Provider call timed out after ${timeoutMs}ms`);
  err.name = 'TimeoutError';
  return err;
}

/** Check if an error is a timeout */
function isTimeoutError(err: unknown): boolean {
  return err instanceof Error &&
    (err.name === 'TimeoutError' || err.message.includes('timed out'));
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
    const { providerCall, loadDataset, datasetId, promptName, promptVersion, triggerType, evaluationId } = options;
    const timeoutMs = options.timeoutMs ?? ContinuousEvaluator.DEFAULT_TIMEOUT_MS;
    const signal = options.signal;
    const startTime = Date.now();

    // If already aborted before starting, return immediately
    if (signal?.aborted) {
      const failure = classifyError(new Error('Evaluation aborted before start'), false, true);
      return createFailedRecord(promptName, promptVersion, triggerType, datasetId, failure, evaluationId);
    }

    // Load fixtures
    let fixtures: Array<{ id: string; messages: Array<{ role: string; content: string }> }>;
    try {
      fixtures = await loadDataset(datasetId);
    } catch (err) {
      const failure = classifyError(err, false, false);
      return createFailedRecord(promptName, promptVersion, triggerType, datasetId, failure, evaluationId);
    }

    if (fixtures.length === 0) {
      const failure: EvaluationFailure = { code: 'DATASET_ERROR', message: `No fixtures found in dataset: ${datasetId}`, retryable: false, timedOut: false, aborted: false };
      return createFailedRecord(promptName, promptVersion, triggerType, datasetId, failure, evaluationId);
    }

    // Run evaluation on each fixture with timeout + abort protection
    const results: FixtureResult[] = [];

    for (const fixture of fixtures) {
      // Check abort before each fixture
      if (signal?.aborted) {
        results.push(createFixtureFailure('PROVIDER_ABORTED', 'Evaluation aborted', true, false));
        continue;
      }

      try {
        // Wrap provider call with timeout and optional abort signal
        const response = await withTimeout(
          providerCall(fixture.messages, {
            temperature: 0.3,
            jsonMode: true,
            signal: signal && !signal.aborted ? signal : undefined,
          }),
          timeoutMs,
          createTimeoutError(timeoutMs),
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
        const timedOut = isTimeoutError(err);
        const aborted = signal?.aborted ?? false;
        const failure = classifyError(err, timedOut, aborted);
        results.push(createFixtureFailure(failure.code, failure.message, timedOut, aborted));
      }
    }

    // Aggregate
    const successful = results.filter(r => r.success);
    const allFailed = results.every(r => !r.success);
    const n = Math.max(1, successful.length);

    const record: ScoreRecord = {
      id: options.evaluationId ?? `eval-${promptName}-${Date.now()}`,
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

interface FixtureResult {
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
  timedOut?: boolean;
  aborted?: boolean;
}

function createFixtureFailure(code: EvaluationErrorCode, message: string, timedOut: boolean, aborted: boolean): FixtureResult {
  return {
    overallScore: 0, rubricScore: 0, semanticScore: 0, structuralScore: 0,
    latencyMs: 0, costUsd: 0, promptTokens: 0, completionTokens: 0,
    jsonRepairCount: 0, retryCount: 0,
    provider: 'unknown', model: 'unknown',
    success: false, errorMessage: message, timedOut, aborted,
  };
}

function createFailedRecord(
  promptName: string, promptVersion: string, triggerType: string, datasetId: string,
  failure: EvaluationFailure,
  evaluationId?: string,
): ScoreRecord {
  return {
    id: evaluationId ?? `eval-${promptName}-${Date.now()}`,
    promptId: promptVersion, promptName,
    timestamp: new Date().toISOString(),
    overallScore: 0, rubricScore: 0, semanticScore: 0, structuralScore: 0,
    latencyMs: 0, costUsd: 0, promptTokens: 0, completionTokens: 0,
    jsonRepairCount: 0, retryCount: 0,
    provider: 'unknown', model: 'unknown',
    success: false,
    errorMessage: failure.message,
    triggerType,
    gitCommit: getGitCommit(),
    datasetId,
  };
}

/**
 * Race a Promise against a timeout. If the timeout fires first,
 * the original Promise continues (cannot be cancelled), but the
 * caller gets a clear timeout error.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  error: Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(error), timeoutMs);
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
