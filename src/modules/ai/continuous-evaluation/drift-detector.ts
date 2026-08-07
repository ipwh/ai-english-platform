// ============================================
// Drift Detector — detects quality degradation
// across all dimensions: overall, rubric, semantic,
// structural, latency, cost, JSON repair, provider.
//
// Compares current evaluation against baseline
// and classifies severity: none, minor, major, critical.
// ============================================

import type { DriftSeverity, DriftThresholds } from './config';
import type { ScoreRecord } from './score-history';

// ── Types ──

/** Complete drift assessment */
export interface DriftReport {
  /** Whether any drift was detected */
  hasDrift: boolean;
  /** Worst severity across all dimensions */
  overallSeverity: DriftSeverity;
  /** Per-dimension drift results */
  dimensions: DriftDimension[];
  /** Current evaluation */
  current: ScoreRecord;
  /** Baseline evaluation */
  baseline: ScoreRecord;
  /** Human-readable summary */
  summary: string;
  /** Timestamp */
  timestamp: string;
}

/** Drift result for a single dimension */
export interface DriftDimension {
  name: string;
  severity: DriftSeverity;
  currentValue: number;
  baselineValue: number;
  delta: number;
  deltaPct: number;
  threshold: number;
  description: string;
}

// ── Public API ──

/**
 * Detect drift between current evaluation and baseline.
 */
export function detectDrift(
  current: ScoreRecord,
  baseline: ScoreRecord,
  thresholds: DriftThresholds,
): DriftReport {
  const dimensions: DriftDimension[] = [];

  // Overall score
  dimensions.push(assessScoreDimension(
    'Overall Score',
    current.overallScore,
    baseline.overallScore,
    thresholds.overallMinor,
    thresholds.overallMajor,
    thresholds.overallCritical,
  ));

  // Semantic score
  dimensions.push(assessScoreDimension(
    'Semantic Score',
    current.semanticScore,
    baseline.semanticScore,
    thresholds.semanticMinor,
    thresholds.semanticMajor,
    thresholds.semanticCritical,
  ));

  // Rubric score
  dimensions.push(assessScoreDimension(
    'Rubric Score',
    current.rubricScore,
    baseline.rubricScore,
    thresholds.rubricMinor,
    thresholds.rubricMajor,
    thresholds.rubricCritical,
  ));

  // Structural score
  dimensions.push(assessScoreDimension(
    'Structural Score',
    current.structuralScore,
    baseline.structuralScore,
    thresholds.structuralMinor,
    thresholds.structuralMajor,
    thresholds.structuralCritical,
  ));

  // Latency (higher is worse)
  dimensions.push(assessIncreaseDimension(
    'Latency',
    current.latencyMs,
    baseline.latencyMs,
    thresholds.latencyMinorPct,
    thresholds.latencyMajorPct,
    thresholds.latencyCriticalPct,
    'ms',
  ));

  // Cost (higher is worse)
  dimensions.push(assessIncreaseDimension(
    'Cost',
    current.costUsd,
    baseline.costUsd,
    thresholds.costMinorPct,
    thresholds.costMajorPct,
    thresholds.costCriticalPct,
    '$',
  ));

  // JSON repair count (any increase is notable)
  dimensions.push(assessIncreaseDimension(
    'JSON Repair',
    current.jsonRepairCount,
    baseline.jsonRepairCount,
    50, 100, 200,
    'repairs',
  ));

  // Provider change
  dimensions.push(assessProviderChange(current, baseline));

  // Overall severity = worst of all dimensions
  const severities = dimensions.map(d => severityRank(d.severity));
  const worstIdx = severities.indexOf(Math.max(...severities));
  const overallSeverity = dimensions[worstIdx]?.severity ?? 'none';
  const hasDrift = overallSeverity !== 'none';

  // Build summary
  const drifting = dimensions.filter(d => d.severity !== 'none');
  const summary = hasDrift
    ? `${drifting.length} dimension(s) showing drift: ${drifting.map(d => `${d.name} (${d.severity})`).join(', ')}`
    : 'No drift detected. All metrics within baseline range.';

  return {
    hasDrift,
    overallSeverity,
    dimensions,
    current,
    baseline,
    summary,
    timestamp: new Date().toISOString(),
  };
}

// ── Dimension Assessment Helpers ──

function assessScoreDimension(
  name: string,
  current: number,
  baseline: number,
  minorThresh: number,
  majorThresh: number,
  criticalThresh: number,
): DriftDimension {
  const delta = current - baseline;
  const absDelta = Math.abs(delta);
  const isDrop = delta < 0; // Negative delta = score went down

  let severity: DriftSeverity = 'none';
  if (isDrop) {
    if (absDelta >= criticalThresh) severity = 'critical';
    else if (absDelta >= majorThresh) severity = 'major';
    else if (absDelta >= minorThresh) severity = 'minor';
  }

  const deltaPct = baseline !== 0 ? (delta / baseline) * 100 : 0;

  return {
    name,
    severity,
    currentValue: current,
    baselineValue: baseline,
    delta,
    deltaPct: Math.round(deltaPct * 10) / 10,
    threshold: minorThresh,
    description: isDrop
      ? `${name} dropped by ${absDelta.toFixed(1)} (${Math.abs(deltaPct).toFixed(1)}%)`
      : `${name} unchanged or improved (Δ=${delta > 0 ? '+' : ''}${delta.toFixed(1)})`,
  };
}

function assessIncreaseDimension(
  name: string,
  current: number,
  baseline: number,
  minorPct: number,
  majorPct: number,
  criticalPct: number,
  unit: string,
): DriftDimension {
  const delta = current - baseline;
  const deltaPct = baseline !== 0 ? (delta / baseline) * 100 : (current > 0 ? 100 : 0);

  let severity: DriftSeverity = 'none';
  if (delta > 0) {
    if (deltaPct >= criticalPct) severity = 'critical';
    else if (deltaPct >= majorPct) severity = 'major';
    else if (deltaPct >= minorPct) severity = 'minor';
  }

  return {
    name,
    severity,
    currentValue: current,
    baselineValue: baseline,
    delta,
    deltaPct: Math.round(deltaPct * 10) / 10,
    threshold: minorPct,
    description: delta > 0
      ? `${name} increased by ${delta.toFixed(1)}${unit} (+${deltaPct.toFixed(1)}%)`
      : `${name} stable or decreased (${delta.toFixed(1)}${unit})`,
  };
}

function assessProviderChange(
  current: ScoreRecord,
  baseline: ScoreRecord,
): DriftDimension {
  const changed = current.provider !== baseline.provider;

  return {
    name: 'Provider',
    severity: changed ? 'minor' : 'none',
    currentValue: 0, // categorical, not numeric
    baselineValue: 0,
    delta: 0,
    deltaPct: 0,
    threshold: 0,
    description: changed
      ? `Provider changed: ${baseline.provider} → ${current.provider}`
      : `Provider unchanged: ${current.provider}`,
  };
}

// ── Helpers ──

function severityRank(s: DriftSeverity): number {
  switch (s) {
    case 'none': return 0;
    case 'minor': return 1;
    case 'major': return 2;
    case 'critical': return 3;
  }
}

/**
 * Compare two drift reports — has drift worsened?
 */
export function compareDrift(
  previous: DriftReport,
  current: DriftReport,
): { worsened: boolean; dimensions: string[] } {
  const worsened: string[] = [];

  for (let i = 0; i < current.dimensions.length; i++) {
    const prevDim = previous.dimensions[i];
    const currDim = current.dimensions[i];
    if (severityRank(currDim.severity) > severityRank(prevDim.severity)) {
      worsened.push(currDim.name);
    }
  }

  return { worsened: worsened.length > 0, dimensions: worsened };
}
