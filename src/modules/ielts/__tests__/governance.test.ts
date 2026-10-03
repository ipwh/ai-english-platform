// ============================================
// IELTS Governance — evidence classes cannot self-upgrade
// ============================================
import { describe, expect, it } from 'vitest';
import {
  containsForbiddenClaim,
  getGovernanceSnapshot,
  IELTS_CALIBRATION_STATUS,
  IELTS_HUMAN_EVIDENCE,
  IELTS_MARKER_EQUIVALENCE,
  IELTS_SUBSYSTEM_STATUS,
  isCalibratedSourceAllowed,
  resolveAssessmentSourceGate,
} from '../governance/states';
import {
  computeAgreementMetrics,
  computeCalibrationReport,
  MIN_CALIBRATION_PAIRS,
  validCalibrationPairs,
} from '../governance/calibration';

describe('frozen governance constants', () => {
  it('human evidence is INSUFFICIENT and marker equivalence UNPROVEN', () => {
    expect(IELTS_HUMAN_EVIDENCE).toBe('INSUFFICIENT');
    expect(IELTS_MARKER_EQUIVALENCE).toBe('UNPROVEN');
    expect(IELTS_CALIBRATION_STATUS).toBe('INSUFFICIENT_DATA');
  });

  it('CALIBRATED_HUMAN_VALIDATED is impossible to produce', () => {
    expect(resolveAssessmentSourceGate()).toBe('AI_ESTIMATE');
    expect(isCalibratedSourceAllowed(0)).toBe(false);
    expect(isCalibratedSourceAllowed(1000)).toBe(false); // constant guard, not a count check
  });

  it('subsystem status is BETA while no human calibration exists', () => {
    expect(IELTS_SUBSYSTEM_STATUS).toBe('BETA');
  });

  it('governance snapshot carries the honest disclaimers', () => {
    const snapshot = getGovernanceSnapshot();
    expect(snapshot.humanEvidence).toBe('INSUFFICIENT');
    expect(snapshot.markerEquivalence).toBe('UNPROVEN');
    expect(snapshot.aiCost).toBe('UNKNOWN');
    expect(snapshot.disclaimers.join(' ')).toMatch(/not an official IELTS test/);
    // 2026-10-03 (IV): BETA while no human-marker calibration exists.
    expect(snapshot.subsystemStatus).toBe('BETA');
    expect(snapshot.disclaimers.join(' ')).toMatch(/BETA/);
    // 2026-10-03 (II): Speaking is preparation-only — no scoring, no examiner sim.
    expect(snapshot.featureStatus.speakingAssessment).toBe('NOT_AVAILABLE');
    expect(snapshot.featureStatus.speakingPronunciationAssessment).toBe('NOT_AVAILABLE');
    expect(snapshot.featureStatus.speakingPreparation).toBe('IMPLEMENTED');
    // 2026-10-03 (IV): AI authoring exists but can only reach QA_REQUIRED.
    expect(snapshot.featureStatus.aiQuestionGeneration).toBe('IMPLEMENTED');
  });

  it('forbidden claim patterns are screened', () => {
    expect(containsForbiddenClaim('This is your official IELTS score')).toBe(true);
    expect(containsForbiddenClaim('graded by a certified IELTS examiner')).toBe(true);
    expect(containsForbiddenClaim('guaranteed band 7')).toBe(true);
    expect(containsForbiddenClaim('IELTS-style practice with an estimated band')).toBe(false);
  });
});

describe('calibration report — no fabricated evidence', () => {
  it('with zero pairs → INSUFFICIENT_DATA and NO metrics', () => {
    const report = computeCalibrationReport([]);
    expect(report.status).toBe('INSUFFICIENT_DATA');
    expect(report.metrics).toBeNull();
    expect(report.pairs).toBe(0);
  });

  it('with fewer than the minimum real pairs → still INSUFFICIENT_DATA', () => {
    const pairs = Array.from({ length: MIN_CALIBRATION_PAIRS - 1 }, (_, i) => ({
      assessmentId: `a-${i}`,
      aiBand: 6,
      humanBand: 6,
    }));
    const report = computeCalibrationReport(pairs);
    expect(report.status).toBe('INSUFFICIENT_DATA');
    expect(report.metrics).toBeNull();
  });

  it('with enough pairs, agreement metrics are computed (calculator test only)', () => {
    const pairs = [
      { assessmentId: 'a1', aiBand: 6.0, humanBand: 6.0 },
      { assessmentId: 'a2', aiBand: 6.5, humanBand: 6.0 },
      { assessmentId: 'a3', aiBand: 7.0, humanBand: 7.0 },
      { assessmentId: 'a4', aiBand: 5.5, humanBand: 6.0 },
      { assessmentId: 'a5', aiBand: 6.5, humanBand: 6.5 },
      { assessmentId: 'a6', aiBand: 7.5, humanBand: 7.0 },
      { assessmentId: 'a7', aiBand: 5.0, humanBand: 5.5 },
      { assessmentId: 'a8', aiBand: 6.0, humanBand: 6.0 },
    ];
    const report = computeCalibrationReport(pairs);
    expect(report.status).toBe('PRELIMINARY');
    expect(report.metrics).not.toBeNull();
    expect(report.metrics!.pairs).toBe(8);
    // MAE = mean(|diffs|) = mean(0,0.5,0,0.5,0,0.5,0.5,0) = 0.25
    expect(report.metrics!.meanAbsoluteError).toBeCloseTo(0.25, 6);
    expect(report.metrics!.exactAgreementRate).toBeCloseTo(0.5, 6);
    expect(report.metrics!.withinHalfBandRate).toBe(1);
    expect(report.note).toMatch(/not an official IELTS validation/i);
  });

  it('invalid bands are filtered out of the calculation (never silently trusted)', () => {
    const filtered = validCalibrationPairs([
      { assessmentId: 'a1', aiBand: 6, humanBand: 6 },
      { assessmentId: 'a2', aiBand: 7.13, humanBand: 6 },
      { assessmentId: 'a3', aiBand: 6, humanBand: 10 },
    ]);
    expect(filtered).toHaveLength(1);
  });

  it('computeAgreementMetrics returns null for empty input', () => {
    expect(computeAgreementMetrics([])).toBeNull();
  });
});
