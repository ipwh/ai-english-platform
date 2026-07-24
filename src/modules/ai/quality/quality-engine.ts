// ============================================
// Sprint 101: Quality Engine
// Orchestrates rule execution, repair, and quality scoring.
// Pure delegation — no business logic, no domain knowledge.
// ============================================

import type { QualityRule, QualityResult, QualityContext, QualityMetrics } from './quality-types';
import { calculateQualityScore } from './quality-types';
import { qualityRegistry } from './quality-registry';
import { applyAllRepairs } from './repair-engine';
import { recordQualityExecution, recordRuleExecution, getRuleHealth } from './quality-metrics';
import { logger } from '@/shared/logger/logger';

export type { QualityRule, QualityResult, QualityContext, QualityMetrics };

/**
 * QualityEngine — the central entry point for AI output quality validation.
 *
 * Usage:
 *   const result = await qualityEngine.execute(validatedOutput, {
 *     outputType: 'GeneratedQuestion',
 *     requestId: 'req-123',
 *   });
 *
 * The engine:
 * 1. Runs all registered quality rules
 * 2. Collects warnings and errors
 * 3. Attempts safe repairs for failed checks
 * 4. Calculates a quality score
 * 5. Records metrics
 * 6. Returns the (possibly repaired) output with quality report
 */
class QualityEngine {
  /**
   * Execute all quality checks on a validated AI output.
   * @param input - The validated AI output (must have passed schema validation)
   * @param context - Execution context (output type, request ID, metadata)
   * @returns QualityResult with score, warnings, errors, repairs, and repaired output
   */
  async execute<T extends Record<string, unknown>>(
    input: T,
    context: QualityContext,
  ): Promise<QualityResult<T>> {
    const startTime = Date.now();

    // 1. Run all matching rules
    const { results, repaired, repairs: repairResults } = qualityRegistry.executeAll(input, context);

    // 2. Collect warnings and errors
    const warnings: string[] = [];
    const errors: string[] = [];
    let rulesPassed = 0;
    let rulesFailed = 0;
    let criticalFailures = 0;
    let highFailures = 0;
    let mediumFailures = 0;
    let lowFailures = 0;

    for (const [ruleId, result] of results) {
      const rule = qualityRegistry.getRule(ruleId);
      const priority = rule?.priority || 'low';
      const ruleStartTime = Date.now();

      if (result.passed) {
        rulesPassed++;
      } else {
        rulesFailed++;
        if (priority === 'critical') criticalFailures++;
        else if (priority === 'high') highFailures++;
        else if (priority === 'medium') mediumFailures++;
        else lowFailures++;

        for (const failure of result.failures) {
          if (priority === 'critical') {
            errors.push(`[${ruleId}] ${failure.message}`);
          } else {
            warnings.push(`[${ruleId}] ${failure.message}`);
          }
        }
      }

      warnings.push(...result.warnings.map(w => `[${ruleId}] ${w}`));

      // Track per-rule metrics (Sprint 102)
      const wasRepaired = repairResults.some(r => r.ruleId === ruleId && r.result.repaired);
      recordRuleExecution(
        ruleId,
        result.passed,
        Date.now() - ruleStartTime,
        wasRepaired,
        result.passed ? undefined : result.failures[0]?.message,
      );
    }

    // 3. Apply remaining safe repairs for any unfixed failures
    const allFailures: Array<{ ruleId: string; message: string }> = [];
    for (const [, result] of results) {
      if (!result.passed) {
        allFailures.push(...result.failures);
      }
    }

    const { output: finalOutput, changes: repairChanges } = applyAllRepairs(
      repaired,
      allFailures,
      context,
    );

    // 4. Calculate quality score
    const score = calculateQualityScore(
      results.size,
      criticalFailures,
      highFailures,
      mediumFailures,
      lowFailures,
      repairResults.length + (repairChanges.length > 0 ? 1 : 0),
    );

    // 5. Build metrics
    const executionTimeMs = Date.now() - startTime;
    const metrics: QualityMetrics = {
      rulesChecked: results.size,
      rulesPassed,
      rulesFailed,
      repairsAttempted: repairResults.length + (repairChanges.length > 0 ? 1 : 0),
      repairsSucceeded: repairResults.filter(r => r.result.repaired).length + (repairChanges.length > 0 ? 1 : 0),
      warningsCount: warnings.length,
      errorsCount: errors.length,
      executionTimeMs,
      score,
    };

    // 6. Record metrics
    recordQualityExecution(metrics);

    // 7. Build and return result
    const result: QualityResult<T> = {
      score,
      passed: criticalFailures === 0,
      warnings,
      errors,
      repairs: [
        ...repairResults.map(r => ({
          ruleId: r.ruleId,
          description: r.result.changes.join('; '),
          success: r.result.repaired,
        })),
        ...(repairChanges.length > 0 ? [{
          ruleId: 'repair-engine',
          description: repairChanges.join('; '),
          success: true,
        }] : []),
      ],
      output: finalOutput,
      metrics,
    };

    logger.info({
      module: 'quality-engine',
      outputType: context.outputType,
      score,
      rulesChecked: metrics.rulesChecked,
      rulesFailed: metrics.rulesFailed,
      repairsApplied: metrics.repairsSucceeded,
      durationMs: executionTimeMs,
    }, 'Quality check completed');

    return result;
  }

  /**
   * Convenience: execute and return only the repaired output (throws on critical errors).
   */
  async executeOrThrow<T extends Record<string, unknown>>(
    input: T,
    context: QualityContext,
  ): Promise<T> {
    const result = await this.execute(input, context);
    if (!result.passed) {
      const errorMsg = `Quality check failed with ${result.errors.length} critical errors: ${result.errors.slice(0, 5).join('; ')}`;
      logger.error({ module: 'quality-engine', errors: result.errors }, errorMsg);
      throw new Error(errorMsg);
    }
    return result.output;
  }

  /**
   * Get current quality health for health endpoint.
   */
  getHealth(): {
    registeredRules: number;
    rules: Array<{ id: string; priority: string }>;
    ruleHealth: ReturnType<typeof getRuleHealth>;
  } {
    const rules = qualityRegistry.listRules();
    return {
      registeredRules: rules.length,
      rules: rules.map(r => ({ id: r.id, priority: r.priority })),
      ruleHealth: getRuleHealth(),
    };
  }
}

/** Singleton instance */
export const qualityEngine = new QualityEngine();
