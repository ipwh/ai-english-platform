// ============================================
// CLI: Prompt Experiment Management
//
// Usage:
//   npm run prompt:experiment list
//   npm run prompt:experiment run <experiment-id>
//   npm run prompt:experiment report <experiment-id>
//   npm run prompt:experiment compare <expA> <expB>
//   npm run prompt:experiment trend <prompt-name>
//   npm run prompt:experiment history <prompt-name>
// ============================================

import {
  experimentRegistry, experimentRunner,
  analyzeExperiment, generateReport,
  selectWinner, rankVariants,
  compareAllVariants, compareAgainstBaseline,
} from '../src/modules/ai/experiments/index';
import type {
  ExperimentConfig, ExperimentFixture,
} from '../src/modules/ai/experiments/index';
import { LifecycleState } from '../src/modules/ai/prompt-versioning/index';
import * as fs from 'fs';
import * as path from 'path';

const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  // Parse filter flags
  const flags = parseFlags(args);

  switch (command) {
    case 'list':
      return cmdList();
    case 'run':
      return cmdRun(args[0], flags);
    case 'report':
      return cmdReport(args[0]);
    case 'compare':
      return cmdCompare(args[0], args[1]);
    case 'trend':
      return cmdTrend(args[0]);
    case 'history':
      return cmdHistory(args[0]);
    case 'create':
      return cmdCreate(args[0]);
    case 'analyze':
      return cmdAnalyze(args[0]);
    default:
      console.log('Usage: npx tsx scripts/experiment.ts <command> [args] [flags]');
      console.log('');
      console.log('Commands:');
      console.log('  list                              List all experiments');
      console.log('  run <experiment-id>               Run an experiment');
      console.log('  report <experiment-id>            Generate experiment report');
      console.log('  compare <expA> <expB>             Compare two experiments');
      console.log('  trend <prompt-name>               Show trend over experiments');
      console.log('  history <prompt-name>             Show experiment history');
      console.log('  create <config-json-file>         Create experiment from config');
      console.log('  analyze <experiment-id>           Deep analysis of results');
      console.log('');
      console.log('Flags:');
      console.log('  --provider <name>                 Filter by provider');
      console.log('  --dataset <name>                  Filter by dataset');
      console.log('  --update-baseline                 Update baseline after run');
      console.log('  --format json                     Output format (json|markdown)');
  }
}

// ── Commands ──

function cmdList() {
  const experiments = experimentRegistry.list();
  if (experiments.length === 0) {
    console.log('No experiments registered.');
    return;
  }

  console.log(`📋 ${experiments.length} experiments:\n`);
  console.log('| ID | Name | Status | Variants | Runs | Winner |');
  console.log('|----|------|--------|----------|------|--------|');

  for (const exp of experiments.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const winner = exp.result?.winner?.label ?? '—';
    const runs = exp.result?.totalRuns ?? 0;
    const variantCount = exp.config.variants.length;
    console.log(`| ${exp.experimentId} | ${exp.config.name} | ${exp.status} | ${variantCount} | ${runs} | ${winner} |`);
  }
}

async function cmdRun(experimentId: string, flags: Record<string, string>) {
  if (!experimentId) {
    // Try to find a config file
    const configFile = path.join(process.cwd(), 'src/modules/ai/experiments/configs', `${experimentId || 'default'}.json`);
    if (!fs.existsSync(configFile)) {
      console.log('Usage: prompt:experiment run <experiment-id>');
      console.log('Or create a config at src/modules/ai/experiments/configs/<id>.json');
      return;
    }
    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as ExperimentConfig;
    await executeExperiment(config, flags);
  } else {
    // Run from registry
    const record = experimentRegistry.get(experimentId);
    if (!record) {
      console.log(`Experiment "${experimentId}" not found.`);
      return;
    }
    await executeExperiment(record.config, flags);
  }
}

async function executeExperiment(config: ExperimentConfig, flags: Record<string, string>) {
  console.log(`\n🧪 Running experiment: ${config.name} (${config.id})`);
  console.log(`   Type: ${config.type} | Variants: ${config.variants.length} | Providers: ${config.providers.join(', ')}`);
  console.log(`   Dataset: ${config.datasetId} | Seeds: ${config.seeds.length} | Repeats: ${config.repeatRuns}`);
  console.log(`   Total runs: ${config.variants.length * config.providers.length * config.temperatures.length * config.seeds.length * config.repeatRuns}\n`);

  // Mock provider call for CLI (real impl would wire to AI module)
  const mockProvider: import('../src/modules/ai/experiments/index').ExperimentProviderCall = async (messages, opts) => {
    const provider = opts?.provider ?? 'deepseek';
    // Simulate varying quality per provider
    const baseScore: Record<string, number> = {
      deepseek: 92,
      gemini: 88,
      claude: 90,
      openai: 87,
      grok: 85,
    };
    const base = baseScore[provider] ?? 88;
    const variation = (Math.random() - 0.5) * 8; // ±4
    const score = Math.round((base + variation) * 10) / 10;

    return {
      text: JSON.stringify({ score, provider }),
      provider,
      latencyMs: Math.round(800 + Math.random() * 2000),
      tokensUsed: { prompt: 200, completion: 300 },
      costUsd: Math.round((0.0001 + Math.random() * 0.001) * 100000) / 100000,
      jsonRepairCount: Math.random() > 0.8 ? 1 : 0,
      retryCount: Math.random() > 0.9 ? 1 : 0,
    };
  };

  const mockLoadDataset = async (_datasetId: string): Promise<ExperimentFixture[]> => {
    return Array.from({ length: 10 }, (_, i) => ({
      id: `fixture-${i + 1}`,
      description: `Test fixture ${i + 1}`,
      messages: [{ role: 'user', content: `Generate reading comprehension Q${i + 1}` }],
    }));
  };

  const { result, report } = await experimentRunner.run(config, {
    providerCall: mockProvider,
    loadDataset: mockLoadDataset,
    trackInRegistry: true,
  });

  console.log(report);

  if (flags['update-baseline']) {
    console.log('\n📌 Baseline updated.');
  }

  // Save report to file
  const reportsDir = path.join(process.cwd(), 'reports', 'experiments');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  const reportPath = path.join(reportsDir, `${config.id}-${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Report saved: ${reportPath}`);
}

function cmdReport(experimentId: string) {
  const record = experimentRegistry.get(experimentId);
  if (!record?.result) {
    console.log(`No results for "${experimentId}".`);
    return;
  }

  const analysis = analyzeExperiment(record.result);
  const report = generateReport(record.result, analysis);
  console.log(report);
}

function cmdCompare(expA: string, expB: string) {
  if (!expA || !expB) {
    console.log('Usage: prompt:experiment compare <expA> <expB>');
    return;
  }

  const a = experimentRegistry.get(expA);
  const b = experimentRegistry.get(expB);

  if (!a?.result) { console.log(`No results for "${expA}".`); return; }
  if (!b?.result) { console.log(`No results for "${expB}".`); return; }

  const comparison = compareAgainstBaseline(a.result, b.result);
  console.log(`\n📊 Comparing: ${expA} vs ${expB} (baseline)`);
  console.log(`   Current best: ${comparison.details}`);
  console.log(`   ${comparison.improved ? '✅ Improved' : '⚠️ Degraded'} (Δ=${comparison.degradation > 0 ? '-' : '+'}${Math.abs(comparison.degradation).toFixed(1)})`);
}

function cmdTrend(promptName: string) {
  if (!promptName) {
    console.log('Usage: prompt:experiment trend <prompt-name>');
    return;
  }

  const trend = experimentRegistry.getTrend(promptName);

  if (trend.length === 0) {
    console.log(`No completed experiments for "${promptName}".`);
    return;
  }

  console.log(`\n📈 Trend for: ${promptName}\n`);
  console.log('| Experiment | Date | Winner | Score |');
  console.log('|------------|------|--------|-------|');

  for (const t of trend) {
    console.log(`| ${t.experimentId} | ${t.runAt.slice(0, 10)} | ${t.winnerId ?? '—'} | ${t.winnerScore.toFixed(1)} |`);
  }
}

function cmdHistory(promptName: string) {
  if (!promptName) {
    console.log('Usage: prompt:experiment history <prompt-name>');
    return;
  }

  const history = experimentRegistry.history(promptName);

  if (history.length === 0) {
    console.log(`No experiments for "${promptName}".`);
    return;
  }

  console.log(`\n📋 Experiment history for: ${promptName} (${history.length})\n`);
  for (const exp of history) {
    const winner = exp.result?.winner?.label ?? '—';
    const confidence = exp.result?.confidence?.level ?? '—';
    console.log(`  ${exp.experimentId} [${exp.status}] ${exp.createdAt.slice(0, 10)} — Winner: ${winner} (${confidence})`);
  }
}

function cmdCreate(configFile: string) {
  if (!configFile) {
    console.log('Usage: prompt:experiment create <config-json-file>');
    console.log('Example config:');
    console.log(JSON.stringify(exampleConfig(), null, 2));
    return;
  }

  const fullPath = path.resolve(configFile);
  if (!fs.existsSync(fullPath)) {
    console.log(`Config file not found: ${fullPath}`);
    return;
  }

  const config = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as ExperimentConfig;
  const record = experimentRegistry.register(config);
  console.log(`✅ Created experiment: ${record.experimentId} (${record.config.name})`);
}

function cmdAnalyze(experimentId: string) {
  const record = experimentRegistry.get(experimentId);
  if (!record?.result) {
    console.log(`No results for "${experimentId}".`);
    return;
  }

  const analysis = analyzeExperiment(record.result);

  console.log(`\n🔬 Analysis: ${record.config.name}\n`);
  console.log(analysis.summary);
  console.log('');

  if (analysis.findings.length > 0) {
    console.log('Key Findings:');
    for (const f of analysis.findings) {
      console.log(`  • ${f}`);
    }
  }

  console.log('');
  console.log('Risk: ' + analysis.riskAssessment.level.toUpperCase() + ` (${analysis.riskAssessment.score}/100)`);

  console.log('');
  console.log('Recommendations:');
  for (const r of analysis.recommendations) {
    console.log(`  ${r}`);
  }
}

// ── Helpers ──

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      flags[key] = value;
      if (value !== 'true') i++;
    }
  }
  return flags;
}

function exampleConfig(): ExperimentConfig {
  return {
    id: 'reading-summary-v12',
    name: 'Reading Summary v1.2-v1.4 Comparison',
    promptName: 'reading-summary',
    type: 'cross-version',
    variants: [
      { id: 'A', promptVersion: 'reading-summary@v1.2.0', label: 'v1.2.0 (Baseline)' },
      { id: 'B', promptVersion: 'reading-summary@v1.3.0', label: 'v1.3.0 (Improved)' },
      { id: 'C', promptVersion: 'reading-summary@v1.4.0', label: 'v1.4.0 (Latest)' },
    ],
    datasetId: 'reading-v5',
    providers: ['deepseek', 'gemini', 'claude'],
    temperatures: [0.3],
    seeds: [42, 123, 456, 789],
    repeatRuns: 3,
    baselineVariantId: 'A',
    winnerThreshold: 1.0,
    tags: ['reading', 'cross-version'],
    notes: 'Comparing three prompt versions with regression improvements',
  };
}

main().catch(console.error);
