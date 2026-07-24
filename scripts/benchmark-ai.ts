// Sprint 96: AI Benchmark CLI — npm run benchmark:ai
// Usage: npx tsx scripts/benchmark-ai.ts
import { runBenchmarkSuite, BENCHMARK_SCENARIOS, generateMarkdownReport, generateJsonReport } from '../src/modules/ai/benchmark';
import { generateQuestions } from '../src/modules/ai/usecases/generate-questions';
import { analyzeAnswer } from '../src/modules/ai/usecases/analyze-answer';
import { analyzeWriting } from '../src/modules/ai/usecases/analyze-writing';
import { explainMistake } from '../src/modules/ai/usecases/explain-mistake';
import { capturePerformanceBaseline } from '../src/modules/ai/services/performance-baseline';
import { runRegressionCheck } from '../src/modules/ai/runtime/regression-detector';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const scenarioRunners: Record<string, (input: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>> = {
  generateQuestions: async (input) => {
    try {
      await generateQuestions(input as Parameters<typeof generateQuestions>[0]);
      return { success: true };
    } catch (e) { return { success: false, error: String(e) }; }
  },
  analyzeAnswer: async (input) => {
    try {
      await analyzeAnswer(input as Parameters<typeof analyzeAnswer>[0]);
      return { success: true };
    } catch (e) { return { success: false, error: String(e) }; }
  },
  analyzeWriting: async (input) => {
    try {
      await analyzeWriting(input as Parameters<typeof analyzeWriting>[0]);
      return { success: true };
    } catch (e) { return { success: false, error: String(e) }; }
  },
  explainMistake: async (input) => {
    try {
      await explainMistake(input as Parameters<typeof explainMistake>[0]);
      return { success: true };
    } catch (e) { return { success: false, error: String(e) }; }
  },
};

async function main() {
  console.log('🤖 AI Benchmark Suite — Sprint 96\n');

  const suite = await runBenchmarkSuite('Sprint 96 Production Readiness', BENCHMARK_SCENARIOS, scenarioRunners);

  // Write reports
  const reportsDir = join(process.cwd(), 'benchmark-reports');
  mkdirSync(reportsDir, { recursive: true });

  const jsonPath = join(reportsDir, 'benchmark.json');
  writeFileSync(jsonPath, generateJsonReport(suite));
  console.log(`📊 JSON report: ${jsonPath}`);

  const mdPath = join(reportsDir, 'benchmark-summary.md');
  writeFileSync(mdPath, generateMarkdownReport(suite));
  console.log(`📝 Markdown report: ${mdPath}`);

  // Capture baseline
  const baseline = capturePerformanceBaseline();
  console.log(`📈 Baseline captured at: ${baseline.capturedAt}`);

  // Run regression check
  const regression = runRegressionCheck();
  console.log(`🔍 Regression: ${regression.summary}`);

  console.log('\n✅ Benchmark suite complete.');
  process.exit(0);
}

main().catch((e) => { console.error('Benchmark failed:', e); process.exit(1); });
