// Sprint 97: Load Test CLI — npm run load:test
import { runLoadSuite, LOAD_SCENARIOS, generateLoadMarkdownReport, generateLoadJsonReport } from '../src/modules/platform/load-testing';
import { runStressTests } from '../src/modules/platform/load-testing/stress-test';
import { getCapacityPlan } from '../src/modules/ai/runtime/capacity-planner';
import { detectSaturation } from '../src/modules/ai/runtime/saturation-detector';
import { generateQuestions } from '../src/modules/ai/usecases/generate-questions';
import { analyzeAnswer } from '../src/modules/ai/usecases/analyze-answer';
import { analyzeWriting } from '../src/modules/ai/usecases/analyze-writing';
import { explainMistake } from '../src/modules/ai/usecases/explain-mistake';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const scenarioRunners: Record<string, (input: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>> = {
  generateQuestions: async (input) => { try { await generateQuestions(input as Parameters<typeof generateQuestions>[0]); return { success: true }; } catch (e) { return { success: false, error: String(e) }; } },
  analyzeAnswer: async (input) => { try { await analyzeAnswer(input as Parameters<typeof analyzeAnswer>[0]); return { success: true }; } catch (e) { return { success: false, error: String(e) }; } },
  analyzeWriting: async (input) => { try { await analyzeWriting(input as Parameters<typeof analyzeWriting>[0]); return { success: true }; } catch (e) { return { success: false, error: String(e) }; } },
  explainMistake: async (input) => { try { await explainMistake(input as Parameters<typeof explainMistake>[0]); return { success: true }; } catch (e) { return { success: false, error: String(e) }; } },
  mixed: async () => { try { await analyzeAnswer(scenarioRunners.analyzeAnswer as unknown as Parameters<typeof analyzeAnswer>[0]); return { success: true }; } catch { return { success: false }; } },
};

async function main() {
  console.log('🔬 Load Test Suite — Sprint 97\n');

  const reportsDir = join(process.cwd(), 'load-reports');
  mkdirSync(reportsDir, { recursive: true });

  // 1. Load test scenarios
  console.log('Running load scenarios...');
  const loadSuite = await runLoadSuite('Sprint 97 Load Test', LOAD_SCENARIOS, scenarioRunners);
  writeFileSync(join(reportsDir, 'load-report.json'), generateLoadJsonReport(loadSuite));
  writeFileSync(join(reportsDir, 'load-report.md'), generateLoadMarkdownReport(loadSuite));
  console.log(`  Load report: load-reports/load-report.{json,md}`);

  // 2. Stress tests
  console.log('Running stress tests (10/25/50/100 concurrency)...');
  const stressSuite = await runStressTests(scenarioRunners.analyzeAnswer);
  writeFileSync(join(reportsDir, 'stress-report.json'), generateLoadJsonReport(stressSuite));
  console.log(`  Stress report: load-reports/stress-report.json`);

  // 3. Capacity plan
  const capacity = getCapacityPlan();
  writeFileSync(join(reportsDir, 'capacity-report.json'), JSON.stringify(capacity, null, 2));
  const capacityMd = `# Capacity Plan\n\n- **Max Concurrent**: ${capacity.maxConcurrentRequests}\n- **Queue Depth**: ${capacity.estimatedQueueDepth}\n- **Retry Amp**: ${capacity.retryAmplification}\n- **Fallback Amp**: ${capacity.fallbackAmplification}\n- **Est. Monthly Cost**: $${capacity.costEstimate.estimatedMonthlyCost}\n\n## Recommendations\n${capacity.recommendations.map(r => `- ${r}`).join('\n')}\n`;
  writeFileSync(join(reportsDir, 'capacity-report.md'), capacityMd);
  console.log('  Capacity report: load-reports/capacity-report.{json,md}');

  // 4. Saturation check
  const saturation = detectSaturation();
  console.log(`\n📊 Saturation: ${saturation.overall.toUpperCase()} — ${saturation.summary}`);
  for (const c of saturation.checks.filter(c => c.severity !== 'healthy')) {
    console.log(`  ${c.severity.toUpperCase()}: ${c.message}`);
  }

  console.log('\n✅ Load test suite complete.');
  process.exit(0);
}

main().catch(e => { console.error('Load test failed:', e); process.exit(1); });
