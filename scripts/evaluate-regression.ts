// ============================================
// CLI: Prompt Regression Evaluation
//
// Usage:
//   npx tsx scripts/evaluate-regression.ts
//   npx tsx scripts/evaluate-regression.ts --filter reading
//   npx tsx scripts/evaluate-regression.ts --update-golden
//
// Exit codes (2026-10-08 — never collapse infrastructure into a regression):
//   0  evaluation ran and every fixture passed
//   1  MODEL REGRESSION — evaluation ran and at least one fixture failed
//   2  unexpected harness error
//   3  PROVIDER UNAVAILABLE — no model API key is configured, so NOTHING was
//      evaluated. This is an infrastructure/configuration outcome and MUST NOT
//      be reported as a prompt regression (CI labels it separately).
//
// Layer separation: the deterministic, offline checks do not need this script —
// run `npm run validate:prompts` plus
// `npx vitest run src/modules/ai/regression src/modules/ai/prompt-versioning`.
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

  // ---- Preflight: is there anything to evaluate against? ------------------
  const { providerRegistry } = await import('../src/modules/ai/providers/provider-registry');
  if (providerRegistry.getAvailableProviders().length === 0) {
    console.error('PROVIDER UNAVAILABLE — no AI provider API key is configured (e.g. DEEPSEEK_API_KEY).');
    console.error('NOTHING was evaluated. This is an INFRASTRUCTURE/CONFIGURATION outcome,');
    console.error('NOT a prompt regression — do not weaken any threshold for it.');
    console.error('Deterministic, offline checks:');
    console.error('  npm run validate:prompts');
    console.error('  npx vitest run src/modules/ai/regression src/modules/ai/prompt-versioning');
    process.exit(3);
  }

  // Wire up the real AI provider from the existing pipeline
  const provider: EvalProviderCall = async (messages, options) => {
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
    if (report.summary.failed !== 0) {
      console.error(`MODEL REGRESSION — ${report.summary.failed} fixture(s) failed.`);
    }
    process.exit(report.summary.failed === 0 ? 0 : 1);
  } catch (err) {
    console.error(
      'Evaluation harness error (NOT a model regression):',
      err instanceof Error ? err.message : err,
    );
    process.exit(2);
  }
}

main();
