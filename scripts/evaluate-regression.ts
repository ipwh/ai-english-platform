// ============================================
// CLI: Prompt Regression Evaluation
//
// Usage:
//   npx tsx scripts/evaluate-regression.ts
//   npx tsx scripts/evaluate-regression.ts --filter reading
//   npx tsx scripts/evaluate-regression.ts --update-golden
// ============================================

import * as path from 'path';
import { runRegression, generateMarkdownReport } from '../src/modules/ai/regression/index';
import type { EvalProviderCall } from '../src/modules/ai/regression/index';

const FIXTURES_DIR = path.resolve(__dirname, '../src/modules/ai/regression/fixtures');
const GOLDEN_DIR = path.resolve(__dirname, '../src/modules/ai/regression/golden');
const REPORTS_DIR = path.resolve(__dirname, '../src/modules/ai/regression/reports');

const args = process.argv.slice(2);
const filter = args.find(a => a.startsWith('--filter='))?.split('=')[1];
const updateGolden = args.includes('--update-golden');

async function main() {
  console.log('🔬 Prompt Regression Evaluation');
  console.log(`   Fixtures: ${FIXTURES_DIR}`);
  console.log(`   Golden: ${GOLDEN_DIR}`);
  console.log(`   Filter: ${filter || 'all'}`);
  console.log(`   Update golden: ${updateGolden}`);
  console.log('');

  // Wire up the real AI provider from the existing pipeline
  const provider: EvalProviderCall = async (messages, options) => {
    // Dynamic import to avoid circular deps at module level
    const { providerRegistry } = await import('../src/modules/ai/providers/provider-registry');
    const start = Date.now();
    const result = await providerRegistry.call(messages, {
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      jsonMode: options?.jsonMode,
      timeoutMs: options?.timeoutMs,
    });
    return {
      text: result.text,
      provider: result.provider,
      latencyMs: Date.now() - start,
    };
  };

  try {
    const report = await runRegression({
      fixturesDir: FIXTURES_DIR,
      goldenDir: GOLDEN_DIR,
      reportsDir: REPORTS_DIR,
      provider,
      filter,
      updateGolden,
    });

    // Generate and print Markdown report
    const md = generateMarkdownReport(report);
    console.log(md);

    // Write Markdown report
    const fs = await import('fs');
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(REPORTS_DIR, 'report.md'), md, 'utf-8');
    console.log(`\n📄 Report saved: ${path.join(REPORTS_DIR, 'report.md')}`);

    // Exit with appropriate code
    process.exit(report.summary.failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('❌ Evaluation failed:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
}

main();
