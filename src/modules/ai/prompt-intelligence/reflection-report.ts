// ============================================
// Sprint 109: Reflection Report
// ============================================

import type { ReflectionResult } from './prompt-types';
import { getPromptMetrics } from './prompt-metrics';

export interface ReflectionReport {
  summary: { avgScore: number; failureRate: number; totalReflections: number };
  lastResult?: { score: number; passed: boolean; warnings: string[]; suggestions: string[]; checks: ReflectionResult['checks'] };
  metrics: ReturnType<typeof getPromptMetrics>;
}

export function generateReflectionReport(lastResult?: ReflectionResult): ReflectionReport {
  const metrics = getPromptMetrics();
  return {
    summary: {
      avgScore: metrics.avgReflectionScore,
      failureRate: metrics.totalReflections > 0
        ? Math.round((metrics.reflectionFailures / metrics.totalReflections) * 100) / 100 : 0,
      totalReflections: metrics.totalReflections,
    },
    lastResult: lastResult ? {
      score: lastResult.score, passed: lastResult.passed,
      warnings: lastResult.warnings, suggestions: lastResult.improvementSuggestions,
      checks: lastResult.checks,
    } : undefined,
    metrics,
  };
}
