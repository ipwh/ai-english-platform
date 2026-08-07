// ============================================
// Regression Monitor — monitors for score
// regressions over time.
//
// Compares each new evaluation against:
//   1. The production baseline
//   2. The previous evaluation
//   3. The 7-day rolling average
//
// Flags regressions when quality drops below
// configurable thresholds.
// ============================================

import type { AlertThresholds } from './config';
import type { ScoreRecord, ScoreSummary } from './score-history';

// ── Types ──

/** Regression check result */
export interface RegressionCheck {
  /** Whether a regression was detected */
  isRegression: boolean;
  /** Severity of the regression */
  severity: 'none' | 'warning' | 'critical';
  /** Which check triggered the regression */
  triggeredBy: string;
  /** Current score */
  currentScore: number;
  /** Reference score (baseline or average) */
  referenceScore: number;
  /** Score delta (negative = regression) */
  delta: number;
  /** Description */
  description: string;
  /** Timestamp */
  timestamp: string;
}

/** Complete regression assessment for a prompt */
export interface RegressionAssessment {
  promptName: string;
  hasRegression: boolean;
  /** Overall regression severity */
  severity: 'none' | 'warning' | 'critical';
  /** Per-dimension checks */
  checks: RegressionCheck[];
  /** Recommendations */
  recommendations: string[];
  /** Timestamp */
  timestamp: string;
}

// ── Public API ──

/**
 * Check for regression by comparing current score against baseline.
 */
export function checkRegression(
  promptName: string,
  current: ScoreRecord,
  baseline: ScoreRecord | undefined,
  previousSummary: ScoreSummary | undefined,
  thresholds: AlertThresholds,
): RegressionAssessment {
  const checks: RegressionCheck[] = [];
  const now = new Date().toISOString();

  // Check 1: vs production baseline
  if (baseline) {
    checks.push(checkAgainstBaseline(current, baseline, thresholds));
  }

  // Check 2: vs 7-day average
  if (previousSummary && previousSummary.recordCount > 0) {
    checks.push(checkAgainstRollingAverage(current, previousSummary, thresholds));
  }

  // Check 3: structural integrity
  checks.push(checkStructuralIntegrity(current, thresholds));

  // Check 4: reliability (JSON repair, retries)
  checks.push(checkReliability(current, thresholds));

  // Determine overall severity
  const hasRegression = checks.some(c => c.isRegression);
  const criticalCount = checks.filter(c => c.severity === 'critical').length;
  const warningCount = checks.filter(c => c.severity === 'warning').length;

  const severity: RegressionAssessment['severity'] =
    criticalCount > 0 ? 'critical' :
    warningCount > 0 ? 'warning' : 'none';

  // Build recommendations
  const recommendations = buildRecommendations(checks, severity);

  return {
    promptName,
    hasRegression,
    severity,
    checks,
    recommendations,
    timestamp: now,
  };
}

// ── Individual Checks ──

function checkAgainstBaseline(
  current: ScoreRecord,
  baseline: ScoreRecord,
  thresholds: AlertThresholds,
): RegressionCheck {
  const delta = current.overallScore - baseline.overallScore;
  const deltaPct = baseline.overallScore !== 0 ? (delta / baseline.overallScore) * 100 : 0;
  const absDrop = Math.abs(Math.min(0, delta));

  const isRegression = delta < -thresholds.overallDropPct;
  let severity: RegressionCheck['severity'] = 'none';

  if (isRegression) {
    if (absDrop >= thresholds.overallDropPct * 2) severity = 'critical';
    else severity = 'warning';
  }

  return {
    isRegression,
    severity,
    triggeredBy: 'baseline_comparison',
    currentScore: current.overallScore,
    referenceScore: baseline.overallScore,
    delta,
    description: isRegression
      ? `Overall score dropped ${absDrop.toFixed(1)} points (${Math.abs(deltaPct).toFixed(1)}%) vs baseline (${baseline.overallScore.toFixed(1)})`
      : `Overall score stable vs baseline (Δ=${delta > 0 ? '+' : ''}${delta.toFixed(1)})`,
    timestamp: new Date().toISOString(),
  };
}

function checkAgainstRollingAverage(
  current: ScoreRecord,
  summary: ScoreSummary,
  thresholds: AlertThresholds,
): RegressionCheck {
  const delta = current.overallScore - summary.meanOverall;
  const deltaPct = summary.meanOverall !== 0 ? (delta / summary.meanOverall) * 100 : 0;
  const absDrop = Math.abs(Math.min(0, delta));

  const isRegression = delta < -thresholds.overallDropPct;
  let severity: RegressionCheck['severity'] = 'none';

  if (isRegression) {
    if (absDrop >= thresholds.overallDropPct * 2) severity = 'critical';
    else severity = 'warning';
  }

  return {
    isRegression,
    severity,
    triggeredBy: 'rolling_average',
    currentScore: current.overallScore,
    referenceScore: summary.meanOverall,
    delta,
    description: isRegression
      ? `Score below ${summary.recordCount}-run average: ${current.overallScore.toFixed(1)} vs avg ${summary.meanOverall.toFixed(1)}`
      : `Score within rolling average range`,
    timestamp: new Date().toISOString(),
  };
}

function checkStructuralIntegrity(
  current: ScoreRecord,
  thresholds: AlertThresholds,
): RegressionCheck {
  const structuralPass = current.structuralScore >= 80; // 80% structural = passing
  const isRegression = !structuralPass && thresholds.structuralFail;

  return {
    isRegression,
    severity: isRegression ? 'critical' : 'none',
    triggeredBy: 'structural_integrity',
    currentScore: current.structuralScore,
    referenceScore: 80,
    delta: current.structuralScore - 80,
    description: isRegression
      ? `Structural score critically low: ${current.structuralScore.toFixed(1)} (threshold: 80)`
      : `Structural integrity OK (${current.structuralScore.toFixed(1)})`,
    timestamp: new Date().toISOString(),
  };
}

function checkReliability(
  current: ScoreRecord,
  thresholds: AlertThresholds,
): RegressionCheck {
  const issues: string[] = [];

  if (current.jsonRepairCount >= thresholds.jsonRepairCount) {
    issues.push(`${current.jsonRepairCount} JSON repairs`);
  }
  if (current.retryCount >= thresholds.retryCount) {
    issues.push(`${current.retryCount} retries`);
  }
  if (!current.success) {
    issues.push('evaluation failed');
  }

  const isRegression = issues.length > 0;

  return {
    isRegression,
    severity: current.success ? 'warning' : 'critical',
    triggeredBy: 'reliability',
    currentScore: current.success ? 100 : 0,
    referenceScore: 100,
    delta: current.success ? 0 : -100,
    description: isRegression
      ? `Reliability issues: ${issues.join(', ')}`
      : 'Reliability OK — no JSON repair or retry issues',
    timestamp: new Date().toISOString(),
  };
}

// ── Recommendations ──

function buildRecommendations(
  checks: RegressionCheck[],
  severity: RegressionAssessment['severity'],
): string[] {
  const recs: string[] = [];

  if (severity === 'critical') {
    recs.push('🔴 CRITICAL: Immediate investigation required. Consider rollback to previous prompt version.');
  } else if (severity === 'warning') {
    recs.push('🟡 WARNING: Monitor closely. Schedule a detailed review within 24 hours.');
  } else {
    return ['✅ No regressions detected. Prompt quality is stable.'];
  }

  for (const check of checks) {
    if (check.isRegression && check.severity === 'critical') {
      switch (check.triggeredBy) {
        case 'structural_integrity':
          recs.push('• Fix structural issues: validate JSON schema, check question counts, verify paragraph references.');
          break;
        case 'reliability':
          recs.push('• Investigate reliability: check provider health, review error logs, consider increasing timeout.');
          break;
        case 'baseline_comparison':
          recs.push('• Review prompt changes since baseline. Consider A/B testing before next release.');
          break;
      }
    }
  }

  return recs;
}

// ── Trend Regression ──

/**
 * Check if there's a sustained downward trend (3+ consecutive drops).
 */
export function checkSustainedRegression(
  recentRecords: ScoreRecord[],
  minConsecutiveDrops: number = 3,
): { isSustained: boolean; streak: number; records: ScoreRecord[] } {
  if (recentRecords.length < minConsecutiveDrops) {
    return { isSustained: false, streak: 0, records: [] };
  }

  const sorted = [...recentRecords].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  let streak = 0;
  const streakRecords: ScoreRecord[] = [];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].overallScore < sorted[i - 1].overallScore) {
      streak++;
      if (streakRecords.length === 0) streakRecords.push(sorted[i - 1]);
      streakRecords.push(sorted[i]);
    } else {
      if (streak >= minConsecutiveDrops - 1) break;
      streak = 0;
      streakRecords.length = 0;
    }
  }

  return {
    isSustained: streak >= minConsecutiveDrops - 1,
    streak,
    records: streakRecords,
  };
}
