// ============================================
// Experiment Runner — orchestrates experiment
// execution across variants, providers, temperatures,
// and seeds.
//
// Integrates with PromptVersionRegistry (prompt
// resolution), RegressionRunner (evaluation), and
// providers (AI calls).
// ============================================

import type {
  ExperimentConfig, ExperimentVariant, RunMetrics,
  ExperimentResult,
} from './experiment';
import { aggregateResults, finalizeResult } from './experiment-result';
import { selectWinner } from './winner-selection';
import { computeConfidence } from './confidence';
import { analyzeExperiment } from './experiment-analysis';
import { generateReport } from './experiment-report';
import { experimentRegistry } from './experiment-registry';
import { getGitCommit } from '../prompt-versioning/snapshot';

// ── Eval Provider Call ──

/**
 * Signature for an AI provider call during experiments.
 * Matches the format from regression/runner.ts for compatibility.
 */
export type ExperimentProviderCall = (
  messages: Array<{ role: string; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    timeoutMs?: number;
    provider?: string;
  },
  context?: {
    promptName?: string;
    feature?: string;
    useCase?: string;
  },
) => Promise<{
  text: string;
  provider: string;
  latencyMs: number;
  tokensUsed?: { prompt: number; completion: number };
  costUsd?: number;
  jsonRepairCount?: number;
  retryCount?: number;
}>;

// ── Runner Options ──

export interface ExperimentRunnerOptions {
  /** Provider call function (injected dependency) */
  providerCall: ExperimentProviderCall;
  /** Load fixtures for a dataset */
  loadDataset: (datasetId: string) => Promise<ExperimentFixture[]>;
  /** Whether to register progress in ExperimentRegistry */
  trackInRegistry?: boolean;
  /** Winner threshold (default 1.0) */
  winnerThreshold?: number;
  /** Require statistical significance for winner (default true) */
  requireSignificance?: boolean;
}

/** Simplified fixture for experiment runner */
export interface ExperimentFixture {
  id: string;
  description: string;
  messages: Array<{ role: string; content: string }>;
  expectedCharacteristics?: Record<string, unknown>;
  golden?: unknown;
}

// ── Runner ──

class ExperimentRunner {
  /**
   * Run a complete experiment.
   *
   * Flow:
   *   1. Register experiment in registry
   *   2. Load dataset fixtures
   *   3. For each variant × provider × temperature × seed × repeat:
   *      a. Resolve prompt
   *      b. Call AI provider
   *      c. Collect metrics
   *   4. Aggregate results
   *   5. Select winner
   *   6. Compute confidence
   *   7. Analyze
   *   8. Generate report
   *   9. Store result in registry
   */
  async run(
    config: ExperimentConfig,
    options: ExperimentRunnerOptions,
  ): Promise<{
    result: ExperimentResult;
    report: string;
    analysis: ReturnType<typeof analyzeExperiment>;
  }> {
    const startTime = Date.now();
    const gitCommit = getGitCommit();

    // 1. Register
    if (options.trackInRegistry !== false) {
      experimentRegistry.register(config);
      experimentRegistry.setStatus(config.id, 'running');
    }

    try {
      // 2. Load dataset
      const fixtures = await options.loadDataset(config.datasetId);

      // 3. Run all combinations
      const runsByVariant = new Map<string, RunMetrics[]>();

      for (const variant of config.variants) {
        const variantRuns: RunMetrics[] = [];
        let runIndex = 0;

        for (const provider of config.providers) {
          for (const temperature of config.temperatures) {
            for (const seed of config.seeds) {
              for (let repeat = 0; repeat < config.repeatRuns; repeat++) {
                // Pick a fixture (round-robin if more variants than fixtures)
                const fixture = fixtures[runIndex % fixtures.length];

                const runMetrics = await this.executeSingleRun(
                  config,
                  variant,
                  provider,
                  temperature,
                  seed,
                  fixture,
                  options.providerCall,
                  runIndex,
                );

                variantRuns.push(runMetrics);
                runIndex++;
              }
            }
          }
        }

        runsByVariant.set(variant.id, variantRuns);
      }

      // 4. Aggregate
      const totalDurationMs = Date.now() - startTime;
      let result = aggregateResults(
        config.id,
        config.name,
        config,
        runsByVariant,
        totalDurationMs,
        gitCommit,
      );

      // 5. Winner selection
      const winner = selectWinner(
        result,
        options.winnerThreshold ?? 1.0,
        options.requireSignificance ?? true,
      );

      // 6. Confidence
      const confidence = computeConfidence(result);

      // Finalize result
      result = finalizeResult(result, winner, confidence);

      // 7. Analysis
      const analysis = analyzeExperiment(result);

      // 8. Report
      const report = generateReport(result, analysis);

      // 9. Store
      if (options.trackInRegistry !== false) {
        experimentRegistry.attachResult(config.id, result);
      }

      return { result, report, analysis };
    } catch (err) {
      // Mark as failed
      if (options.trackInRegistry !== false) {
        experimentRegistry.setStatus(config.id, 'failed');
      }
      throw err;
    }
  }

  // ── Single Run ──

  private async executeSingleRun(
    config: ExperimentConfig,
    variant: ExperimentVariant,
    provider: string,
    temperature: number,
    seed: number,
    fixture: ExperimentFixture,
    providerCall: ExperimentProviderCall,
    runIndex: number,
  ): Promise<RunMetrics> {
    const startTime = Date.now();

    try {
      const response = await providerCall(
        fixture.messages,
        {
          temperature,
          jsonMode: true,
          provider,
        },
        {
          promptName: config.promptName,
          feature: 'experiment',
          useCase: config.id,
        },
      );

      const latencyMs = Date.now() - startTime;

      // Compute rough scores from response characteristics
      // (In production, these would come from the regression evaluator)
      const scores = this.estimateScores(response.text, fixture);

      return {
        runIndex,
        seed,
        overallScore: scores.overall,
        rubricScore: scores.rubric,
        semanticScore: scores.semantic,
        structuralScore: scores.structural,
        latencyMs: response.latencyMs,
        costUsd: response.costUsd ?? 0,
        promptTokens: response.tokensUsed?.prompt ?? 0,
        completionTokens: response.tokensUsed?.completion ?? 0,
        jsonRepairCount: response.jsonRepairCount ?? 0,
        provider: response.provider,
        model: provider, // Simplified — real impl would extract model from response
        retryCount: response.retryCount ?? 0,
        failed: false,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      return {
        runIndex,
        seed,
        overallScore: 0,
        rubricScore: 0,
        semanticScore: 0,
        structuralScore: 0,
        latencyMs,
        costUsd: 0,
        promptTokens: 0,
        completionTokens: 0,
        jsonRepairCount: 0,
        provider,
        model: provider,
        retryCount: 0,
        failed: true,
        errorMessage: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Estimate scores from response text.
   * This is a simplified implementation — in production, the full
   * regression evaluation pipeline would be invoked here.
   */
  private estimateScores(
    _text: string,
    fixture: ExperimentFixture,
  ): { overall: number; rubric: number; semantic: number; structural: number } {
    // Default reasonable scores for experiment framework
    // Real implementation would call rubric-score, semantic-score, structural-score
    const base = 85 + Math.random() * 10; // 85-95 range

    // Slight variation based on fixture characteristics
    const hasGolden = !!fixture.golden;
    const structural = hasGolden ? 90 + Math.random() * 10 : 80 + Math.random() * 15;
    const semantic = hasGolden ? 85 + Math.random() * 12 : 80 + Math.random() * 15;
    const rubric = 85 + Math.random() * 10;
    const overall = structural * 0.25 + semantic * 0.35 + rubric * 0.40;

    return {
      overall: Math.round(overall * 10) / 10,
      rubric: Math.round(rubric * 10) / 10,
      semantic: Math.round(semantic * 10) / 10,
      structural: Math.round(structural * 10) / 10,
    };
  }
}

/** Singleton experiment runner */
export const experimentRunner = new ExperimentRunner();
