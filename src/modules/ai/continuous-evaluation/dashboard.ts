// ============================================
// Dashboard — aggregated view model for the
// continuous evaluation platform.
//
// Provides a single snapshot of:
//   - Production prompts & quality
//   - Average latency & cost
//   - Current regressions
//   - Open alerts
//   - Provider health
//   - Recent releases
// ============================================

import type { QualityTrend } from './quality-trend';
import type { ProviderHealth } from './provider-monitor';
import type { Alert, AlertSummary } from './alert';
import type { RegressionAssessment } from './regression-monitor';
import type { DriftReport } from './drift-detector';
import { alertEngine } from './alert';
import { TREND_LABELS } from './config';
import { PROVIDER_STATUS_ICONS } from './provider-monitor';

// ── Types ──

/** Complete dashboard snapshot */
export interface DashboardSnapshot {
  /** Overall system health */
  health: SystemHealth;
  /** Prompt quality overview */
  prompts: PromptQualityCard[];
  /** Provider health overview */
  providers: ProviderHealthCard[];
  /** Alert summary */
  alertSummary: AlertSummary;
  /** Recent activity */
  recentActivity: RecentActivityItem[];
  /** Trends at a glance */
  trendsAtGlance: TrendGlance[];
  /** Timestamp */
  timestamp: string;
}

/** System health assessment */
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  score: number; // 0-100
  summary: string;
}

/** Per-prompt quality card */
export interface PromptQualityCard {
  promptName: string;
  currentScore: number;
  trend: 'improving' | 'stable' | 'declining' | 'volatile';
  drift: string; // "No Drift" / "Minor Drift" etc.
  hasRegression: boolean;
  alertCount: number;
  lastEvaluated: string;
}

/** Provider health card */
export interface ProviderHealthCard {
  provider: string;
  status: string;
  successRate: number;
  avgLatency: number;
  trend: string;
}

/** Recent activity item */
export interface RecentActivityItem {
  type: 'evaluation' | 'alert' | 'release' | 'drift';
  description: string;
  timestamp: string;
  severity?: string;
}

/** Trend glance */
export interface TrendGlance {
  promptName: string;
  direction: string;
  current: number;
  change: number; // percentage change
}

// ── Public API ──

/**
 * Generate a full dashboard snapshot.
 */
export function generateDashboard(params: {
  trends: QualityTrend[];
  providerHealth: ProviderHealth[];
  regressions?: RegressionAssessment[];
  driftReports?: Map<string, DriftReport>;
  recentRuns?: Array<{ promptName: string; record: { overallScore: number; timestamp: string } }>;
}): DashboardSnapshot {
  const { trends, providerHealth, regressions = [], driftReports, recentRuns = [] } = params;

  // System health
  const health = computeSystemHealth(trends, providerHealth, regressions);

  // Prompt cards
  const prompts = buildPromptCards(trends, regressions, driftReports);

  // Provider cards
  const providers = buildProviderCards(providerHealth);

  // Alert summary
  const alertSummary = alertEngine.getSummary();

  // Recent activity
  const recentActivity = buildRecentActivity(recentRuns, alertEngine.getOpen().slice(0, 5));

  // Trend glances
  const trendsAtGlance = buildTrendGlances(trends);

  return {
    health,
    prompts,
    providers,
    alertSummary,
    recentActivity,
    trendsAtGlance,
    timestamp: new Date().toISOString(),
  };
}

// ── System Health ──

function computeSystemHealth(
  trends: QualityTrend[],
  providerHealth: ProviderHealth[],
  regressions: RegressionAssessment[],
): SystemHealth {
  let score = 100;

  // Penalize declining trends
  const decliningCount = trends.filter(t => t.overallDirection === 'declining').length;
  score -= decliningCount * 15;

  // Penalize unhealthy providers
  const unhealthyProviders = providerHealth.filter(p => p.status === 'unhealthy' || p.status === 'down').length;
  score -= unhealthyProviders * 20;

  // Penalize regressions
  score -= regressions.filter(r => r.hasRegression).length * 10;

  // Penalize critical alerts
  score -= alertEngine.getCritical().length * 15;

  score = Math.max(0, Math.min(100, score));

  const status: SystemHealth['status'] =
    score >= 80 ? 'healthy' :
    score >= 50 ? 'degraded' : 'critical';

  const summary = status === 'healthy'
    ? 'All systems operating normally. No significant issues detected.'
    : status === 'degraded'
    ? `${decliningCount} prompt(s) declining, ${unhealthyProviders} provider(s) unhealthy — investigation recommended.`
    : 'Critical issues detected — immediate attention required.';

  return { status, score, summary };
}

// ── Prompt Cards ──

function buildPromptCards(
  trends: QualityTrend[],
  regressions: RegressionAssessment[],
  driftReports?: Map<string, DriftReport>,
): PromptQualityCard[] {
  return trends.map(t => {
    const regression = regressions.find(r => r.promptName === t.promptName);
    const drift = driftReports?.get(t.promptName);

    return {
      promptName: t.promptName,
      currentScore: t.shortTerm.endScore || t.shortTerm.movingAverage,
      trend: t.overallDirection,
      drift: drift?.overallSeverity === 'none' || !drift ? 'No Drift' : drift.overallSeverity,
      hasRegression: regression?.hasRegression ?? false,
      alertCount: alertEngine.getOpenForPrompt(t.promptName).length,
      lastEvaluated: drift?.timestamp?.slice(0, 19) ?? '—',
    };
  });
}

// ── Provider Cards ──

function buildProviderCards(health: ProviderHealth[]): ProviderHealthCard[] {
  return health.map(h => ({
    provider: h.provider,
    status: `${PROVIDER_STATUS_ICONS[h.status]} ${h.status}`,
    successRate: h.successRate,
    avgLatency: h.avgLatencyMs,
    trend: h.status === 'healthy' ? 'stable' : h.status === 'degraded' ? 'declining' : 'critical',
  }));
}

// ── Recent Activity ──

function buildRecentActivity(
  recentRuns: Array<{ promptName: string; record: { overallScore: number; timestamp: string } }>,
  recentAlerts: Alert[],
): RecentActivityItem[] {
  const items: RecentActivityItem[] = [];

  // Add recent evaluations
  for (const run of recentRuns.slice(-5)) {
    items.push({
      type: 'evaluation',
      description: `${run.promptName}: score ${run.record.overallScore.toFixed(1)}`,
      timestamp: run.record.timestamp,
    });
  }

  // Add recent alerts
  for (const alert of recentAlerts.slice(0, 5)) {
    items.push({
      type: 'alert',
      description: alert.title,
      timestamp: alert.createdAt,
      severity: alert.severity,
    });
  }

  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 15);
}

// ── Trend Glances ──

function buildTrendGlances(trends: QualityTrend[]): TrendGlance[] {
  return trends
    .filter(t => t.shortTerm.recordCount > 0)
    .map(t => ({
      promptName: t.promptName,
      direction: TREND_LABELS[t.overallDirection],
      current: t.shortTerm.endScore || t.shortTerm.movingAverage,
      change: t.shortTerm.startScore !== 0
        ? Math.round(((t.shortTerm.endScore - t.shortTerm.startScore) / t.shortTerm.startScore) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => a.change - b.change); // Worst first
}

// ── Markdown Render ──

/**
 * Render dashboard as Markdown for CLI output.
 */
export function renderDashboardMarkdown(dashboard: DashboardSnapshot): string {
  const lines: string[] = [];

  lines.push('# 🖥️ Continuous Evaluation Dashboard');
  lines.push(`**${dashboard.timestamp.slice(0, 19)}** | Health: ${dashboard.health.status.toUpperCase()} (${dashboard.health.score}/100)`);
  lines.push('');
  lines.push(dashboard.health.summary);
  lines.push('');

  // Prompts
  lines.push('## 📋 Prompts');
  lines.push('');
  lines.push('| Prompt | Score | Trend | Drift | Alerts |');
  lines.push('|--------|-------|-------|-------|--------|');
  for (const p of dashboard.prompts) {
    lines.push(`| ${p.promptName} | ${p.currentScore.toFixed(1)} | ${TREND_LABELS[p.trend]} | ${p.drift} | ${p.alertCount} |`);
  }

  // Providers
  if (dashboard.providers.length > 0) {
    lines.push('');
    lines.push('## 🌐 Providers');
    lines.push('');
    lines.push('| Provider | Status | Success Rate | Avg Latency |');
    lines.push('|----------|--------|--------------|-------------|');
    for (const p of dashboard.providers) {
      lines.push(`| ${p.provider} | ${p.status} | ${(p.successRate * 100).toFixed(1)}% | ${p.avgLatency}ms |`);
    }
  }

  // Alerts
  lines.push('');
  lines.push('## 🚨 Alerts');
  lines.push(`Total: ${dashboard.alertSummary.total} | Open: ${dashboard.alertSummary.openCount} | Critical: ${dashboard.alertSummary.criticalCount}`);

  // Recent activity
  if (dashboard.recentActivity.length > 0) {
    lines.push('');
    lines.push('## 📜 Recent Activity');
    lines.push('');
    for (const item of dashboard.recentActivity.slice(0, 10)) {
      const icon = item.type === 'alert' ? '🚨' : item.type === 'drift' ? '📉' : '📊';
      lines.push(`- ${icon} ${item.timestamp.slice(11, 19)} — ${item.description}`);
    }
  }

  return lines.join('\n');
}
