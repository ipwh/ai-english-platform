// ============================================
// CLI: Continuous Prompt Evaluation Monitor
//
// Usage:
//   npm run prompt:monitor daily
//   npm run prompt:monitor report
//   npm run prompt:monitor dashboard
//   npm run prompt:monitor baseline
//   npm run prompt:monitor alerts
//   npm run prompt:monitor trend <prompt-name>
//   npm run prompt:monitor providers
// ============================================

import {
  monitor, scoreHistory, baselineManager,
  scheduler, alertEngine,
  computeQualityTrend, getAllTrends,
  computeAllProviderHealth,
  generateContinuousReport, generateDashboard, renderDashboardMarkdown,
} from '../src/modules/ai/continuous-evaluation/index';
import type {
  ContinuousEvalConfig, ScoreRecord, MonitorRun,
} from '../src/modules/ai/continuous-evaluation/index';
import { DEFAULT_CONTINUOUS_EVAL_CONFIG } from '../src/modules/ai/continuous-evaluation/index';
import * as fs from 'fs';
import * as path from 'path';

const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  // Initialize monitor with mock provider for CLI
  initializeMockMonitor();

  switch (command) {
    case 'daily':
    case 'hourly':
    case 'weekly':
      return cmdRun(command);
    case 'report':
      return cmdReport();
    case 'dashboard':
      return cmdDashboard();
    case 'baseline':
      return cmdBaseline(args[0]);
    case 'alerts':
      return cmdAlerts();
    case 'trend':
      return cmdTrend(args[0]);
    case 'providers':
      return cmdProviders();
    case 'history':
      return cmdHistory(args[0]);
    default:
      console.log('Usage: npx tsx scripts/monitor.ts <command> [args]');
      console.log('');
      console.log('Commands:');
      console.log('  daily             Run daily evaluation cycle');
      console.log('  hourly            Run hourly evaluation cycle');
      console.log('  weekly            Run weekly evaluation cycle');
      console.log('  report            Generate full monitoring report');
      console.log('  dashboard         Show monitoring dashboard');
      console.log('  baseline <prompt> Show baseline comparison');
      console.log('  alerts            List open alerts');
      console.log('  trend <prompt>    Show quality trend');
      console.log('  providers         Show provider health');
      console.log('  history <prompt>  Show evaluation history');
  }
}

// ── Init ──

function initializeMockMonitor() {
  // Mock provider call for CLI demonstration
  const mockProvider = {
    providerCall: async (
      messages: Array<{ role: string; content: string }>,
      _opts?: Record<string, unknown>,
    ) => {
      const providers = ['deepseek', 'gemini', 'claude'];
      const provider = providers[Math.floor(Math.random() * providers.length)];
      return {
        text: JSON.stringify({ score: 90 + Math.random() * 10 }),
        provider,
        model: provider,
        latencyMs: Math.round(800 + Math.random() * 1500),
        tokensUsed: { prompt: 200, completion: 300 },
        costUsd: Math.round((0.0001 + Math.random() * 0.0005) * 100000) / 100000,
        jsonRepairCount: Math.random() > 0.85 ? 1 : 0,
        retryCount: Math.random() > 0.9 ? 1 : 0,
      };
    },
    loadDataset: async (_id: string) => {
      return Array.from({ length: 5 }, (_, i) => ({
        id: `fixture-${i + 1}`,
        messages: [{ role: 'user', content: `Generate test output ${i + 1}` }],
      }));
    },
  };

  monitor.initialize({
    providerCall: mockProvider.providerCall,
    loadDataset: mockProvider.loadDataset,
    datasetId: 'continuous-eval-default',
  });

  // Set up some monitoring schedules
  scheduler.schedule('reading-summary', ['daily', 'onRelease']);
  scheduler.schedule('writing-task', ['daily', 'onRelease']);
}

// ── Commands ──

async function cmdRun(triggerType: string) {
  console.log(`\n🔄 Running ${triggerType} evaluation cycle...\n`);

  const results = await monitor.runAll(triggerType);

  if (results.length === 0) {
    console.log('No prompts to evaluate. Register prompts first or add score records.');
    return;
  }

  for (const run of results) {
    const driftIcon = run.drift ? (run.drift.hasDrift ? '⚠️' : '✅') : '—';
    const regIcon = run.regression.hasRegression ? '🔴' : '✅';
    console.log(`  ${run.promptName}: ${run.record.overallScore.toFixed(1)} | Drift: ${driftIcon} | Regression: ${regIcon} | Alerts: ${run.alerts.length}`);
  }

  // Save report
  saveReport(results);
}

async function cmdReport() {
  const trends = getAllTrends(DEFAULT_CONTINUOUS_EVAL_CONFIG.trendWindows);
  const providerHealth = computeAllProviderHealth(getAllRecords());
  const openAlerts = alertEngine.getOpen();
  const runs: MonitorRun[] = []; // In production, retrieve from stored history

  const report = generateContinuousReport({
    runs,
    trends,
    providerHealth,
    openAlerts,
  });

  console.log(report);
}

async function cmdDashboard() {
  const trends = getAllTrends(DEFAULT_CONTINUOUS_EVAL_CONFIG.trendWindows);
  const providerHealth = computeAllProviderHealth(getAllRecords());

  const snapshot = generateDashboard({
    trends,
    providerHealth,
  });

  console.log(renderDashboardMarkdown(snapshot));
}

function cmdBaseline(promptName?: string) {
  if (!promptName) {
    const prompts = baselineManager.listMonitoredPrompts();
    if (prompts.length === 0) {
      console.log('No baselines set. Run an evaluation first.');
      return;
    }
    console.log('Monitored prompts:');
    for (const p of prompts) {
      const baseline = baselineManager.getProductionBaseline(p);
      console.log(`  ${p}: ${baseline?.record.overallScore.toFixed(1) ?? 'no baseline'}`);
    }
    return;
  }

  const comparison = baselineManager.compareToBaseline(promptName);
  if (!comparison.hasBaseline) {
    console.log(`No baseline for "${promptName}".`);
    return;
  }

  console.log(`\n📊 Baseline comparison: ${promptName}`);
  console.log(`   Current: ${comparison.current?.overallScore.toFixed(1)}`);
  console.log(`   Baseline: ${comparison.baseline?.overallScore.toFixed(1)}`);
  console.log(`   Δ: ${comparison.delta! > 0 ? '+' : ''}${comparison.delta!.toFixed(1)}`);

  const baselines = baselineManager.listBaselines(promptName);
  if (baselines.length > 1) {
    console.log(`\n   All baselines (${baselines.length}):`);
    for (const b of baselines) {
      console.log(`     ${b.type}: ${b.record.overallScore.toFixed(1)} — ${b.label ?? b.createdAt.slice(0, 10)}`);
    }
  }
}

function cmdAlerts() {
  const open = alertEngine.getOpen();

  if (open.length === 0) {
    console.log('✅ No open alerts.');
    return;
  }

  console.log(`\n🚨 ${open.length} open alerts:\n`);

  for (const alert of open) {
    const ack = alert.acknowledged ? '[ACK]' : '[NEW]';
    console.log(`  ${ack} ${alert.title}`);
    console.log(`      ${alert.description}`);
    console.log(`      Prompt: ${alert.promptName} | ${alert.createdAt.slice(0, 19)}`);
    console.log('');
  }
}

function cmdTrend(promptName?: string) {
  if (!promptName) {
    const trends = getAllTrends(DEFAULT_CONTINUOUS_EVAL_CONFIG.trendWindows);
    console.log(`\n📈 Trends for ${trends.length} prompts:\n`);
    for (const t of trends) {
      const dir = t.overallDirection === 'improving' ? '↑' : t.overallDirection === 'declining' ? '↓' : '→';
      console.log(`  ${dir} ${t.promptName}: ${t.shortTerm.movingAverage.toFixed(1)} (${t.shortTerm.recordCount} runs in 7d)`);
    }
    return;
  }

  const trend = computeQualityTrend(promptName, DEFAULT_CONTINUOUS_EVAL_CONFIG.trendWindows);

  console.log(`\n📈 Trend: ${promptName}\n`);
  console.log(`  7-day:  ${trend.shortTerm.movingAverage.toFixed(1)} (${trend.shortTerm.recordCount} runs, slope: ${trend.shortTerm.slope > 0 ? '+' : ''}${trend.shortTerm.slope.toFixed(2)}/day, ${trend.shortTerm.direction})`);
  console.log(`  30-day: ${trend.mediumTerm.movingAverage.toFixed(1)} (${trend.mediumTerm.recordCount} runs, ${trend.mediumTerm.direction})`);
  console.log(`  90-day: ${trend.longTerm.movingAverage.toFixed(1)} (${trend.longTerm.recordCount} runs, ${trend.longTerm.direction})`);
  console.log(`  Overall: ${trend.overallDirection} | Peak: ${trend.isAtPeak ? 'Yes' : 'No'} | Trough: ${trend.isAtTrough ? 'Yes' : 'No'}`);
}

function cmdProviders() {
  const records = getAllRecords();
  const health = computeAllProviderHealth(records);

  if (health.length === 0) {
    console.log('No provider data available.');
    return;
  }

  console.log('\n🌐 Provider Health:\n');
  console.log('| Provider | Status | Success | Latency | Cost |');
  console.log('|----------|--------|---------|---------|------|');

  for (const h of health) {
    const icon = h.status === 'healthy' ? '🟢' : h.status === 'degraded' ? '🟡' : h.status === 'unhealthy' ? '🟠' : '🔴';
    console.log(`| ${icon} ${h.provider} | ${h.status} | ${(h.successRate * 100).toFixed(1)}% | ${h.avgLatencyMs}ms | $${h.avgCostUsd.toFixed(5)} |`);
  }
}

function cmdHistory(promptName?: string) {
  if (!promptName) {
    const prompts = scoreHistory.getAllPromptNames();
    console.log(`\n📋 ${prompts.length} prompts with history:\n`);
    for (const p of prompts) {
      const count = scoreHistory.getByPrompt(p).length;
      const latest = scoreHistory.getLatest(p);
      console.log(`  ${p}: ${count} records | Latest: ${latest?.overallScore.toFixed(1) ?? '—'}`);
    }
    return;
  }

  const records = scoreHistory.getRecent(promptName, 20);

  if (records.length === 0) {
    console.log(`No history for "${promptName}".`);
    return;
  }

  console.log(`\n📋 History: ${promptName} (${records.length} recent)\n`);
  console.log('| Time | Overall | Rubric | Semantic | Structural | Latency | Provider |');
  console.log('|------|---------|--------|----------|------------|---------|----------|');

  for (const r of records) {
    console.log(`| ${r.timestamp.slice(11, 19)} | ${r.overallScore.toFixed(1)} | ${r.rubricScore.toFixed(1)} | ${r.semanticScore.toFixed(1)} | ${r.structuralScore.toFixed(1)} | ${r.latencyMs}ms | ${r.provider} |`);
  }
}

// ── Helpers ──

function getAllRecords(): ScoreRecord[] {
  const records: ScoreRecord[] = [];
  for (const prompt of scoreHistory.getAllPromptNames()) {
    records.push(...scoreHistory.getRecent(prompt, 50));
  }
  return records;
}

function saveReport(results: MonitorRun[]) {
  const reportsDir = path.join(process.cwd(), 'reports', 'continuous-evaluation');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const trends = getAllTrends(DEFAULT_CONTINUOUS_EVAL_CONFIG.trendWindows);
  const providerHealth = computeAllProviderHealth(getAllRecords());
  const openAlerts = alertEngine.getOpen();

  const report = generateContinuousReport({
    runs: results,
    trends,
    providerHealth,
    openAlerts,
  });

  const filename = `monitor-${new Date().toISOString().slice(0, 10)}.md`;
  const reportPath = path.join(reportsDir, filename);
  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Report saved: ${reportPath}`);
}

main().catch(console.error);
