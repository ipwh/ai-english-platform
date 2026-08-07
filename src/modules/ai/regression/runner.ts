// ============================================
// Regression Runner — orchestrates full evaluation pipeline
//
// Fixture → Prompt Builder → AI Provider → Scoring → Report
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
 * Run the full regression evaluation suite.
 */
export async function runRegression(options: RunOptions): Promise<RegressionReport> {
  const config = options.config ?? DEFAULT_REGRESSION_CONFIG;
  const fixtures = loadFixtures(options.fixturesDir, options.filter);

  const results: EvalResult[] = [];
  let totalLatency = 0;
  let totalTokens = 0;

  for (const fixture of fixtures) {
    const result = await evaluateFixture(fixture, options);
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

  // Load previous report for delta comparison
  const previousReport = loadPreviousReport(options.reportsDir);
  const previousOverallScore = previousReport?.summary.overallScore;

  // Sort by score delta for regression analysis
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

  // Write report if output directory specified
  if (options.reportsDir) {
    writeReport(report, options.reportsDir);
  }

  return report;
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
  let callLatency = 0;

  try {
    const response = await options.provider(
      fixture.messages.map(m => ({ role: m.role, content: m.content })),
      fixture.options,
    );
    provider = response.provider;
    callLatency = response.latencyMs;

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
    return JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
  } catch {
    return undefined;
  }
}

function saveGolden(fixtureId: string, output: unknown, goldenDir: string): void {
  if (!fs.existsSync(goldenDir)) {
    fs.mkdirSync(goldenDir, { recursive: true });
  }
  const goldenPath = path.join(goldenDir, `${fixtureId}.golden.json`);
  fs.writeFileSync(goldenPath, JSON.stringify(output, null, 2), 'utf-8');
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
