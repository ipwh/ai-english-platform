// ============================================
// Experiment Report — Markdown report generation
// for experiment results, analysis, and recommendations.
//
// Generates production-quality Markdown with tables,
// score breakdowns, and visual indicators.
// ============================================

import type {
  ExperimentResult, ExperimentAnalysis, ExperimentConfig,
  VariantResult, ExperimentReportConfig,
} from './experiment';
import { scoreDistribution } from './experiment-comparison';

// ── Public API ──

const DEFAULT_REPORT_CONFIG: ExperimentReportConfig = {
  includeRunDetails: false,
  includeProviderBreakdown: true,
  includeSeedAnalysis: true,
  includeCostAnalysis: true,
  includeRecommendations: true,
  format: 'markdown',
};

/**
 * Generate a full Markdown experiment report.
 */
export function generateReport(
  result: ExperimentResult,
  analysis: ExperimentAnalysis,
  config?: ExperimentReportConfig,
): string {
  const cfg = { ...DEFAULT_REPORT_CONFIG, ...config };

  if (cfg.format === 'json') {
    return JSON.stringify({ result, analysis }, null, 2);
  }

  const lines: string[] = [];

  // Header
  lines.push(...generateHeader(result));
  lines.push('');

  // Winner
  lines.push(...generateWinnerSection(result));
  lines.push('');

  // Variants table
  lines.push(...generateVariantsTable(result));
  lines.push('');

  // Scores chart
  lines.push(...generateScoresChart(result));
  lines.push('');

  // Analysis
  lines.push(...generateAnalysisSection(analysis));
  lines.push('');

  // Provider breakdown
  if (cfg.includeProviderBreakdown) {
    lines.push(...generateProviderSection(result));
    lines.push('');
  }

  // Seed analysis
  if (cfg.includeSeedAnalysis) {
    lines.push(...generateSeedSection(result));
    lines.push('');
  }

  // Cost analysis
  if (cfg.includeCostAnalysis) {
    lines.push(...generateCostSection(result));
    lines.push('');
  }

  // Recommendations
  if (cfg.includeRecommendations) {
    lines.push(...generateRecommendationsSection(analysis));
    lines.push('');
  }

  // Risk
  lines.push(...generateRiskSection(analysis));
  lines.push('');

  // Metadata
  lines.push(...generateMetadata(result));

  return lines.join('\n');
}

// ── Header ──

function generateHeader(result: ExperimentResult): string[] {
  return [
    `# Experiment: ${result.experimentName}`,
    '',
    `**Run at:** ${result.runAt} | **Duration:** ${(result.totalDurationMs / 1000).toFixed(1)}s | **Runs:** ${result.totalRuns}`,
    `**Dataset:** ${result.datasetId} | **Provider:** ${result.provider} | **Commit:** \`${result.gitCommit.slice(0, 7)}\``,
  ];
}

// ── Winner ──

function generateWinnerSection(result: ExperimentResult): string[] {
  const lines: string[] = ['## 🏆 Winner', ''];

  if (result.winner?.isSignificant && result.winner.variantId) {
    lines.push(`**${result.winner.label}** — Overall: **${result.winner.breakdown.overall.winner.toFixed(1)}** | Confidence: **${result.confidence.level}**`);
    lines.push('');
    lines.push(`> ${result.winner.reason}`);

    // Score delta breakdown
    const b = result.winner.breakdown;
    lines.push('');
    lines.push('| Dimension | Winner | Runner-up | Δ |');
    lines.push('|-----------|--------|-----------|----|');
    lines.push(`| Overall | ${b.overall.winner.toFixed(1)} | ${b.overall.runnerUp.toFixed(1)} | ${deltaStr(b.overall.delta)} |`);
    lines.push(`| Structural | ${b.structural.winner.toFixed(1)} | ${b.structural.runnerUp.toFixed(1)} | ${deltaStr(b.structural.delta)} |`);
    lines.push(`| Semantic | ${b.semantic.winner.toFixed(1)} | ${b.semantic.runnerUp.toFixed(1)} | ${deltaStr(b.semantic.delta)} |`);
    lines.push(`| Rubric | ${b.rubric.winner.toFixed(1)} | ${b.rubric.runnerUp.toFixed(1)} | ${deltaStr(b.rubric.delta)} |`);
    lines.push(`| Cost | $${b.cost.winner.toFixed(4)} | $${b.cost.runnerUp.toFixed(4)} | ${deltaStr(b.cost.delta, true)} |`);
    lines.push(`| Latency | ${b.latency.winner.toFixed(0)}ms | ${b.latency.runnerUp.toFixed(0)}ms | ${deltaStr(b.latency.delta, true)} |`);
  } else {
    lines.push(`**No significant winner** — ${result.winner?.reason ?? 'Insufficient data'}`);
  }

  return lines;
}

// ── Variants Table ──

function generateVariantsTable(result: ExperimentResult): string[] {
  const lines: string[] = ['## 📊 Variant Results', ''];

  lines.push('| Variant | Overall | Rubric | Semantic | Structural | Latency | Cost | Success |');
  lines.push('|---------|---------|--------|----------|------------|---------|------|---------|');

  const sorted = [...result.variants].sort((a, b) => b.meanOverall - a.meanOverall);

  for (const v of sorted) {
    const isWinner = v.variantId === result.winner?.variantId;
    const prefix = isWinner ? '🏆 ' : '';
    const successRate = (v.successRate * 100).toFixed(0);
    lines.push(
      `| ${prefix}${v.label} | **${v.meanOverall.toFixed(1)}** | ${v.meanRubric.toFixed(1)} | ${v.meanSemantic.toFixed(1)} | ${v.meanStructural.toFixed(1)} | ${v.meanLatencyMs.toFixed(0)}ms | $${v.meanCostUsd.toFixed(4)} | ${successRate}% |`,
    );
  }

  // StdDev row
  lines.push('');
  lines.push('*Standard deviations:*');
  lines.push('| Variant | σ Overall | σ Rubric | σ Semantic | σ Structural |');
  lines.push('|---------|-----------|----------|------------|--------------|');
  for (const v of sorted) {
    lines.push(`| ${v.label} | ${v.stdDevOverall.toFixed(2)} | — | — | — |`);
  }

  return lines;
}

// ── Scores Chart (ASCII bar chart in Markdown) ──

function generateScoresChart(result: ExperimentResult): string[] {
  const lines: string[] = ['## 📈 Score Distribution', ''];

  const sorted = [...result.variants].sort((a, b) => b.meanOverall - a.meanOverall);

  for (const v of sorted) {
    lines.push(`### ${v.label} (μ=${v.meanOverall.toFixed(1)}, σ=${v.stdDevOverall.toFixed(2)})`);
    lines.push('');
    const dist = scoreDistribution(v);
    for (const bucket of dist) {
      if (bucket.count > 0) {
        lines.push(`\`${bucket.range.padStart(5)}\` ${bucket.label.split(':')[1]?.trim() ?? ''}`);
      }
    }
    lines.push('');
  }

  return lines;
}

// ── Analysis Section ──

function generateAnalysisSection(analysis: ExperimentAnalysis): string[] {
  const lines: string[] = ['## 🔬 Analysis', ''];

  lines.push(`### Summary`);
  lines.push(analysis.summary);
  lines.push('');

  if (analysis.findings.length > 0) {
    lines.push('### Key Findings');
    for (const f of analysis.findings) {
      lines.push(`- ${f}`);
    }
  }

  // Variant analysis
  if (analysis.variantAnalysis.length > 0) {
    lines.push('');
    lines.push('### Variant Breakdown');
    for (const va of analysis.variantAnalysis) {
      lines.push(`**${va.variantId}** (trend: ${va.scoreTrend}, outlier rate: ${va.outlierRate.toFixed(1)}%)`);
      if (va.strengths.length > 0) {
        lines.push(`- ✅ ${va.strengths.join(', ')}`);
      }
      if (va.weaknesses.length > 0) {
        lines.push(`- ⚠️ ${va.weaknesses.join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines;
}

// ── Provider Section ──

function generateProviderSection(result: ExperimentResult): string[] {
  const lines: string[] = ['## 🌐 Provider Breakdown', ''];

  // Collect unique providers
  const providers = new Set<string>();
  for (const v of result.variants) {
    for (const p of Object.keys(v.providerBreakdown)) {
      providers.add(p);
    }
  }

  if (providers.size === 0) {
    lines.push('*No provider breakdown available.*');
    return lines;
  }

  lines.push('| Provider | Variant | Runs | Mean Score | Mean Latency |');
  lines.push('|----------|---------|------|------------|--------------|');

  for (const v of result.variants) {
    for (const [provider, breakdown] of Object.entries(v.providerBreakdown)) {
      lines.push(
        `| ${provider} | ${v.label} | ${breakdown.runs} | ${breakdown.meanOverall.toFixed(1)} | ${breakdown.meanLatencyMs.toFixed(0)}ms |`,
      );
    }
  }

  return lines;
}

// ── Seed Section ──

function generateSeedSection(result: ExperimentResult): string[] {
  const lines: string[] = ['## 🎲 Seed Stability', ''];

  // Collect unique seeds
  const seeds = new Set<number>();
  for (const v of result.variants) {
    for (const seed of Object.keys(v.seedBreakdown).map(Number)) {
      seeds.add(seed);
    }
  }

  if (seeds.size <= 1) {
    lines.push('*Only one seed used — seed stability not assessed.*');
    return lines;
  }

  lines.push('| Seed | ' + result.variants.map(v => v.label).join(' | ') + ' |');
  lines.push('|------|' + result.variants.map(() => '-------|').join(''));

  for (const seed of [...seeds].sort()) {
    const row = [`${seed}`];
    for (const v of result.variants) {
      const breakdown = v.seedBreakdown[seed];
      if (breakdown) {
        row.push(`${breakdown.meanOverall.toFixed(1)} ± ${breakdown.stdDevOverall.toFixed(1)}`);
      } else {
        row.push('—');
      }
    }
    lines.push(`| ${row.join(' | ')} |`);
  }

  lines.push('');
  lines.push(`**Seed Stability Score:** ${result.confidence.seedStability.toFixed(1)}/100`);

  return lines;
}

// ── Cost Section ──

function generateCostSection(result: ExperimentResult): string[] {
  const lines: string[] = ['## 💰 Cost Analysis', ''];

  lines.push('| Variant | Mean Cost | Total Cost | Cost/Run | Score/$ |');
  lines.push('|---------|-----------|------------|----------|---------|');

  for (const v of result.variants) {
    const costPerRun = v.totalRuns > 0 ? v.totalCostUsd / v.totalRuns : 0;
    const scorePerDollar = v.meanCostUsd > 0 ? (v.meanOverall / v.meanCostUsd).toFixed(0) : '∞';
    lines.push(
      `| ${v.label} | $${v.meanCostUsd.toFixed(5)} | $${v.totalCostUsd.toFixed(4)} | $${costPerRun.toFixed(5)} | ${scorePerDollar} |`,
    );
  }

  return lines;
}

// ── Recommendations ──

function generateRecommendationsSection(analysis: ExperimentAnalysis): string[] {
  const lines: string[] = ['## 💡 Recommendations', ''];

  if (analysis.recommendations.length === 0) {
    lines.push('*No specific recommendations.*');
    return lines;
  }

  for (const rec of analysis.recommendations) {
    lines.push(`- ${rec}`);
  }

  return lines;
}

// ── Risk Section ──

function generateRiskSection(analysis: ExperimentAnalysis): string[] {
  const r = analysis.riskAssessment;

  const levelEmoji: Record<string, string> = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };

  const lines: string[] = [
    '## ⚠️ Risk Assessment',
    '',
    `**Level:** ${levelEmoji[r.level] ?? ''} ${r.level.toUpperCase()} (score: ${r.score}/100)`,
    '',
  ];

  if (r.factors.length > 0) {
    lines.push('**Risk factors:**');
    for (const f of r.factors) {
      lines.push(`- ${f}`);
    }
  } else {
    lines.push('*No significant risk factors identified.*');
  }

  // Sensitivity
  lines.push('');
  lines.push('**Sensitivity:**');
  lines.push(`- Seed sensitivity: ${analysis.sensitivity.seedSensitivity}/100 (lower is better)`);
  lines.push(`- Temperature sensitivity: ${analysis.sensitivity.temperatureSensitivity}/100`);
  lines.push(`- Min runs for significance: ${analysis.sensitivity.minRunsForSignificance}`);

  return lines;
}

// ── Metadata ──

function generateMetadata(result: ExperimentResult): string[] {
  return [
    '---',
    '',
    `*Report generated at: ${new Date().toISOString()}*`,
    `*Experiment ID: \`${result.experimentId}\`*`,
    `*Git commit: \`${result.gitCommit}\`*`,
  ];
}

// ── Helpers ──

function deltaStr(delta: number, higherIsBetter: boolean = false): string {
  if (delta === 0) return '0';
  const sign = higherIsBetter
    ? (delta > 0 ? '+' : '')
    : (delta > 0 ? '+' : '');
  return `${sign}${delta.toFixed(1)}`;
}
