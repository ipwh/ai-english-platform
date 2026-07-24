// Sprint 97: Stress Test Engine — predefined concurrency levels
import { runLoadScenario, runLoadSuite } from './load-test-runner';
import type { LoadScenario, LoadResult, LoadSuite } from './load-test-types';

export const STRESS_LEVELS = [10, 25, 50, 100] as const;

export function createStressScenarios(targetFn: string, input: Record<string, unknown>): LoadScenario[] {
  return STRESS_LEVELS.map(concurrency => ({
    name: `stress-${concurrency}-${targetFn}`,
    description: `Stress test: ${concurrency} concurrent requests to ${targetFn}`,
    pattern: 'burst' as const,
    concurrency,
    totalRequests: concurrency,
    burstDelayMs: 20,
    targetFn,
    input,
  }));
}

export async function runStressTests(
  runner: (input: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>,
): Promise<LoadSuite> {
  const scenarios = createStressScenarios('analyzeAnswer', {
    question: 'If it ___ tomorrow, we will stay home.',
    questionType: 'mc', correctAnswer: 'B', studentAnswer: 'A',
    choices: ['rain', 'rains', 'rained', 'raining'], grammarItemZh: '條件句',
  });

  return runLoadSuite('Stress Test Suite', scenarios, { analyzeAnswer: runner });
}

export { runLoadScenario, runLoadSuite };
export type { LoadScenario, LoadResult, LoadSuite };
