// ============================================
// Continuous Evaluation — Configuration
//
// All schedule types, thresholds, alert severities,
// and evaluation window definitions.
// ============================================

// ── Schedule ──

/** Evaluation schedule types */
export type EvaluationSchedule =
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'manual'
  | 'onRelease'
  | 'onProviderChange';

/** Human-readable schedule labels */
export const SCHEDULE_LABELS: Record<EvaluationSchedule, string> = {
  hourly: 'Every hour',
  daily: 'Every day',
  weekly: 'Every week',
  manual: 'On demand',
  onRelease: 'After release',
  onProviderChange: 'After provider change',
};

// ── Drift Severity ──

/** Drift severity levels */
export type DriftSeverity = 'none' | 'minor' | 'major' | 'critical';

export const DRIFT_LABELS: Record<DriftSeverity, string> = {
  none: 'No Drift',
  minor: 'Minor Drift',
  major: 'Major Drift',
  critical: 'Critical Drift',
};

export const DRIFT_ICONS: Record<DriftSeverity, string> = {
  none: '✅',
  minor: '🟡',
  major: '🟠',
  critical: '🔴',
};

// ── Alert Severity ──

/** Alert severity levels */
export type AlertSeverity = 'info' | 'warning' | 'high' | 'critical';

export const ALERT_LABELS: Record<AlertSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  high: 'High',
  critical: 'Critical',
};

export const ALERT_ICONS: Record<AlertSeverity, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  high: '🔶',
  critical: '🔴',
};

// ── Trend Direction ──

/** Quality trend direction */
export type TrendDirection = 'improving' | 'stable' | 'declining' | 'volatile';

export const TREND_LABELS: Record<TrendDirection, string> = {
  improving: '📈 Improving',
  stable: '➡️ Stable',
  declining: '📉 Declining',
  volatile: '🔄 Volatile',
};

// ── Evaluation Configuration ──

/** Complete continuous evaluation configuration */
export interface ContinuousEvalConfig {
  /** Which prompts to monitor (empty = all production) */
  monitoredPrompts: string[];
  /** Evaluation schedules */
  schedules: EvaluationSchedule[];
  /** Drift detection thresholds */
  driftThresholds: DriftThresholds;
  /** Alert thresholds */
  alertThresholds: AlertThresholds;
  /** Trend analysis windows */
  trendWindows: TrendWindows;
  /** Maximum history entries to retain */
  maxHistoryEntries: number;
  /** Whether to auto-update baseline on improvement */
  autoUpdateBaseline: boolean;
}

/** Drift detection thresholds */
export interface DriftThresholds {
  /** Overall score drop to trigger minor drift */
  overallMinor: number;    // default: 1
  /** Overall score drop to trigger major drift */
  overallMajor: number;    // default: 3
  /** Overall score drop to trigger critical drift */
  overallCritical: number; // default: 5
  /** Semantic score drop for minor drift */
  semanticMinor: number;
  semanticMajor: number;
  semanticCritical: number;
  /** Rubric score drop for minor drift */
  rubricMinor: number;
  rubricMajor: number;
  rubricCritical: number;
  /** Structural score drop for minor drift */
  structuralMinor: number;
  structuralMajor: number;
  structuralCritical: number;
  /** Latency increase % for minor drift */
  latencyMinorPct: number;  // default: 10
  latencyMajorPct: number;  // default: 20
  latencyCriticalPct: number; // default: 50
  /** Cost increase % for minor drift */
  costMinorPct: number;
  costMajorPct: number;
  costCriticalPct: number;
}

/** Alert thresholds */
export interface AlertThresholds {
  /** Overall score drop % to trigger alert */
  overallDropPct: number;        // default: 3
  /** Semantic score drop % */
  semanticDropPct: number;       // default: 3
  /** Structural failure (any) */
  structuralFail: boolean;       // default: true
  /** Latency increase % */
  latencyIncreasePct: number;    // default: 20
  /** Cost increase % */
  costIncreasePct: number;       // default: 20
  /** Repeated JSON repair count threshold */
  jsonRepairCount: number;       // default: 3
  /** Repeated retry count threshold */
  retryCount: number;            // default: 2
  /** Unexpected provider fallback */
  providerFallback: boolean;     // default: true
}

/** Trend analysis windows */
export interface TrendWindows {
  /** Short-term window in days */
  shortTerm: number;   // default: 7
  /** Medium-term window in days */
  mediumTerm: number;  // default: 30
  /** Long-term window in days */
  longTerm: number;    // default: 90
}

// ── Defaults ──

/** Default continuous evaluation configuration */
export const DEFAULT_CONTINUOUS_EVAL_CONFIG: ContinuousEvalConfig = {
  monitoredPrompts: [],
  schedules: ['daily', 'onRelease', 'onProviderChange'],
  driftThresholds: {
    overallMinor: 1,
    overallMajor: 3,
    overallCritical: 5,
    semanticMinor: 1,
    semanticMajor: 3,
    semanticCritical: 5,
    rubricMinor: 1,
    rubricMajor: 3,
    rubricCritical: 5,
    structuralMinor: 1,
    structuralMajor: 3,
    structuralCritical: 5,
    latencyMinorPct: 10,
    latencyMajorPct: 20,
    latencyCriticalPct: 50,
    costMinorPct: 10,
    costMajorPct: 20,
    costCriticalPct: 50,
  },
  alertThresholds: {
    overallDropPct: 3,
    semanticDropPct: 3,
    structuralFail: true,
    latencyIncreasePct: 20,
    costIncreasePct: 20,
    jsonRepairCount: 3,
    retryCount: 2,
    providerFallback: true,
  },
  trendWindows: {
    shortTerm: 7,
    mediumTerm: 30,
    longTerm: 90,
  },
  maxHistoryEntries: 1000,
  autoUpdateBaseline: false,
};
