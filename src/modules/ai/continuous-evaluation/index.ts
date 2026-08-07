// ============================================
// Continuous Evaluation — Barrel Export
// ============================================

export type {
  // Config
  EvaluationSchedule, DriftSeverity, AlertSeverity, TrendDirection,
  ContinuousEvalConfig, DriftThresholds, AlertThresholds, TrendWindows,
} from './config';
export {
  SCHEDULE_LABELS, DRIFT_LABELS, DRIFT_ICONS,
  ALERT_LABELS, ALERT_ICONS, TREND_LABELS,
  DEFAULT_CONTINUOUS_EVAL_CONFIG,
} from './config';

// ── Score History ──
export { scoreHistory } from './score-history';
export type { ScoreRecord, ScoreSummary } from './score-history';

// ── Drift Detector ──
export { detectDrift, compareDrift } from './drift-detector';
export type { DriftReport, DriftDimension } from './drift-detector';

// ── Regression Monitor ──
export { checkRegression, checkSustainedRegression } from './regression-monitor';
export type { RegressionCheck, RegressionAssessment } from './regression-monitor';

// ── Provider Monitor ──
export {
  computeProviderHealth, computeAllProviderHealth,
  compareProviderHealth, computeProviderTrend,
} from './provider-monitor';
export type { ProviderHealth, ProviderStatus } from './provider-monitor';
export { PROVIDER_STATUS_ICONS } from './provider-monitor';

// ── Baseline Manager ──
export { baselineManager } from './baseline-manager';
export type { Baseline, BaselineType } from './baseline-manager';

// ── Quality Trend ──
export { computeQualityTrend, projectScore, getAllTrends } from './quality-trend';
export type { QualityTrend, WindowTrend } from './quality-trend';

// ── Alert Engine ──
export { alertEngine } from './alert';
export type { Alert, AlertSummary, AlertCategory } from './alert';
export { ALERT_CATEGORY_LABELS } from './alert';

// ── Evaluator ──
export { continuousEvaluator } from './evaluator';
export type { ContinuousEvalProviderCall, EvaluatorOptions } from './evaluator';

// ── Scheduler ──
export { scheduler } from './scheduler';
export type { ScheduleEntry, ScheduledEvalCallback } from './scheduler';

// ── Monitor ──
export { monitor } from './monitor';
export type { MonitorRun, MonitorOptions } from './monitor';

// ── Report ──
export { generateContinuousReport } from './report';

// ── Dashboard ──
export { generateDashboard, renderDashboardMarkdown } from './dashboard';
export type {
  DashboardSnapshot, SystemHealth, PromptQualityCard,
  ProviderHealthCard, RecentActivityItem, TrendGlance,
} from './dashboard';
