// ============================================
// Regression Runner — orchestrates full evaluation pipeline
//
// Fixture → Prompt Builder → AI Provider → Scoring → Report
//
// Built on the shared PromptOps Foundation's BaseRunner
// for consistent lifecycle management.
// ============================================

import * as fs from 'fs';
import * as path from 'path';
import type {
  EvalFixture, EvalResult, RegressionReport, RegressionConfig,
  EvalScores, EvalFailure,
} from './types';
import { DEFAULT_REGRESSION_CONFIG, SCORE_WEIGHTS } from './types';
import { computeRubricScore } from './rubric-score';
import { computeSemanticScore } from './semantic-score';
import { computeStructuralScore } from './structural-score';
import {
  BaseRunner,
  type RunnerContext,
  type RunnerResult,
} from '../foundation';

/** Provider call signature — injected so runner doesn't depend on AI module */
export type EvalProviderCall = (
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean; timeoutMs?: number },
) => Promise<{ text: string; provider: string; latencyMs: number }>;

export interface RunOptions {
  fixturesDir: string;
  goldenDir: string;
  provider: EvalProviderCall;
  config?: RegressionConfig;
  /** If true, saves generated outputs as new golden files */
  updateGolden?: boolean;
  /** Filter fixtures by prefix (e.g. "reading") */
  filter?: string;
  /** Output directory for reports */
  reportsDir?: string;
}

/**
 * Internal runner class that extends BaseRunner for lifecycle consistency.
 * The public API remains the `runRegression()` function.
 */
class RegressionRunnerImpl extends BaseRunner<RunOptions, RegressionReport> {
  protected async execute(
    _context: RunnerContext,
    input: RunOptions,
  ): Promise<RegressionReport> {
    const fixtures = loadFixtures(input.fixturesDir, input.filter);

    const results: EvalResult[] = [];
    let totalLatency = 0;
    let totalTokens = 0;

    for (const fixture of fixtures) {
      const result = await evaluateFixture(fixture, input);
      results.push(result);
      totalLatency += result.latencyMs;
      totalTokens += result.tokensUsed ?? 0;
    }

    // Compute regression analysis
    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);
    const overallScore = results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.scores.overall, 0) / results.length)
      : 0;

    const previousReport = loadPreviousReport(input.reportsDir);
    const previousOverallScore = previousReport?.summary.overallScore;

    const sortedByScore = [...results].sort((a, b) => a.scores.overall - b.scores.overall);
    const worstRegressions = sortedByScore.slice(0, 5);
    const addedStrengths = sortedByScore.reverse().slice(0, 5);
    const removedCapabilities = results.filter(r => {
      const prev = previousReport?.results.find(pr => pr.fixtureId === r.fixtureId);
      return prev?.passed && !r.passed;
    });

    const report: RegressionReport = {
      summary: {
        totalFixtures: fixtures.length,
        passed: passed.length,
        failed: failed.length,
        overallScore,
        previousOverallScore,
        scoreDelta: previousOverallScore ? overallScore - previousOverallScore : undefined,
        provider: results[0]?.provider ?? 'unknown',
        totalLatencyMs: totalLatency,
        totalTokensUsed: totalTokens,
        evaluatedAt: new Date().toISOString(),
      },
      results,
      worstRegressions,
      addedStrengths,
      removedCapabilities,
    };

    return report;
  }

  protected async afterRun(
    context: RunnerContext,
    output: RegressionReport,
  ): Promise<void> {
    const reportsDir = context.metadata['reportsDir'] as string | undefined;
    if (reportsDir) {
      writeReport(output, reportsDir);
    }
  }
}

const regressionRunnerImpl = new RegressionRunnerImpl();

/**
 * Run the full regression evaluation suite.
 *
 * Internally delegates to a BaseRunner subclass for consistent
 * lifecycle management (beforeRun → execute → afterRun → cleanup).
 */
export async function runRegression(options: RunOptions): Promise<RegressionReport> {
  const result: RunnerResult<RegressionReport> = await regressionRunnerImpl.run({
    input: options,
    metadata: { reportsDir: options.reportsDir },
  });

  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? 'Regression run failed');
  }

  // Report is already written by afterRun() hook — no duplicate write needed

  return result.data;
}

/**
 * Evaluate a single fixture through the full pipeline.
 */
async function evaluateFixture(
  fixture: EvalFixture,
  options: RunOptions,
): Promise<EvalResult> {
  const startTime = Date.now();
  const failures: EvalFailure[] = [];

  // Step 1: Call AI provider
  let output: unknown;
  let provider = 'unknown';

  try {
    const response = await options.provider(
      fixture.messages.map(m => ({ role: m.role, content: m.content })),
      fixture.options,
    );
    provider = response.provider;

    // Parse JSON output
    try {
      output = JSON.parse(response.text);
    } catch {
      // Try to extract JSON from markdown fences
      const match = response.text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) {
        try {
          output = JSON.parse(match[1].trim());
        } catch {
          output = response.text; // store raw text
        }
      } else {
        output = response.text;
      }
    }
  } catch (err) {
    output = null;
    failures.push({
      dimension: 'structural',
      check: 'providerCall',
      message: err instanceof Error ? err.message : 'Provider call failed',
    });
  }

  // Step 2: Load golden output
  const golden = loadGolden(fixture.id, options.goldenDir);

  // Step 3: Compute scores
  const rubric = computeRubricScore(output, fixture.expectedCharacteristics);
  const semantic = computeSemanticScore(output, golden, fixture.expectedCharacteristics);
  const structural = computeStructuralScore(output, fixture.expectedCharacteristics);

  // Step 4: Collect failures
  collectFailures(failures, rubric, semantic, structural, fixture.expectedCharacteristics);

  // Step 5: Check regression rules
  const config = options.config ?? DEFAULT_REGRESSION_CONFIG;
  let passed = true;

  if (structural.score < 100 && config.structuralFailIsHardFail) {
    passed = false;
  }
  if (semantic.score < config.minSemanticScore) {
    passed = false;
  }

  const overallScore = Math.round(
    rubric.score * SCORE_WEIGHTS.rubric +
    semantic.score * SCORE_WEIGHTS.semantic +
    structural.score * SCORE_WEIGHTS.structural,
  );

  // Update golden if requested
  if (options.updateGolden && passed) {
    saveGolden(fixture.id, output, options.goldenDir);
  }

  return {
    fixtureId: fixture.id,
    passed,
    scores: { rubric, semantic, structural, overall: overallScore },
    output,
    golden,
    provider,
    latencyMs: Date.now() - startTime,
    tokensUsed: estimateTokens(fixture),
    failures,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Helpers ──

function loadFixtures(dir: string, filter?: string): EvalFixture[] {
  const fixtures: EvalFixture[] = [];
  if (!fs.existsSync(dir)) return fixtures;

  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.json') && !entry.name.includes('.golden.')) {
        if (filter && !full.includes(filter)) continue;
        try {
          fixtures.push(JSON.parse(fs.readFileSync(full, 'utf-8')));
        } catch { /* skip invalid fixtures */ }
      }
    }
  }

  walk(dir);
  return fixtures;
}

function loadGolden(fixtureId: string, goldenDir: string): unknown | undefined {
  const goldenPath = path.join(goldenDir, `${fixtureId}.golden.json`);
  if (!fs.existsSync(goldenPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
    // Phase 7: goldens are stored in a labelled envelope — unwrap it.
    if (
      parsed && typeof parsed === "object"
      && (parsed as { goldenType?: unknown }).goldenType === "AI_AUTHORED_REGRESSION_BASELINE"
    ) {
      return (parsed as { output?: unknown }).output;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function saveGolden(fixtureId: string, output: unknown, goldenDir: string): void {
  if (!fs.existsSync(goldenDir)) {
    fs.mkdirSync(goldenDir, { recursive: true });
  }
  const goldenPath = path.join(goldenDir, `${fixtureId}.golden.json`);
  // R3.10-K Phase 7: goldens saved from AI output are AI-authored
  // REGRESSION BASELINES — they must never share semantic identity
  // with HUMAN_MARKER_GROUND_TRUTH calibration evidence.
  const labeled = {
    goldenType: "AI_AUTHORED_REGRESSION_BASELINE",
    note: "Generated from AI output via --update-golden. Regression baseline ONLY — NOT human ground truth, NOT calibration evidence.",
    output,
  };
  fs.writeFileSync(goldenPath, JSON.stringify(labeled, null, 2), 'utf-8');
}

function loadPreviousReport(reportsDir?: string): RegressionReport | null {
  if (!reportsDir) return null;
  const latestPath = path.join(reportsDir, 'latest.json');
  if (!fs.existsSync(latestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeReport(report: RegressionReport, reportsDir: string): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(reportsDir, 'latest.json'),
    JSON.stringify(report, null, 2),
    'utf-8',
  );
}

function collectFailures(
  failures: EvalFailure[],
  rubric: EvalScores['rubric'],
  semantic: EvalScores['semantic'],
  structural: EvalScores['structural'],
  expected: EvalFixture['expectedCharacteristics'],
): void {
  // Rubric failures
  if (rubric.dimensions.accuracy < 5) {
    failures.push({ dimension: 'rubric', check: 'accuracy', message: 'Low accuracy score' });
  }
  if (rubric.dimensions.hallucination < 5) {
    failures.push({ dimension: 'rubric', check: 'hallucination', message: 'High hallucination detected' });
  }
  if (rubric.dimensions.jsonValidity < 5) {
    failures.push({ dimension: 'rubric', check: 'jsonValidity', message: 'Malformed JSON output' });
  }

  // Structural failures
  if (!structural.checks.jsonSchema) {
    failures.push({ dimension: 'structural', check: 'jsonSchema', message: 'Invalid JSON schema' });
  }
  if (!structural.checks.questionCount) {
    failures.push({
      dimension: 'structural', check: 'questionCount',
      message: `Expected ~${expected.questionCount} questions`,
      expected: expected.questionCount,
    });
  }
  if (!structural.checks.paragraphDistribution) {
    failures.push({
      dimension: 'structural', check: 'paragraphDistribution',
      message: `Expected ${expected.paragraphCount} paragraphs`,
      expected: expected.paragraphCount,
    });
  }
}

function estimateTokens(fixture: EvalFixture): number {
  return fixture.messages.reduce((sum, m) => sum + m.content.length, 0) / 4; // rough estimate
}
