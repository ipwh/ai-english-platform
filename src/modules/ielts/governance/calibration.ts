// ============================================
// IELTS Calibration Analysis — INFRASTRUCTURE ONLY, NO FABRICATED EVIDENCE
// ============================================
// AI_SCORE → HUMAN_MARKER_SCORE → PAIRING → AGREEMENT ANALYSIS → BIAS/ERROR →
// CALIBRATION STATUS
//
// With zero real human-marker pairs (current state) every metric is withheld:
// status = INSUFFICIENT_DATA and the functions return `null` metrics rather
// than computing something from empty data. Never fake calibration evidence.
// ============================================

import { isValidBand } from '../domain/bands';
import { IELTS_CALIBRATION_STATUS } from './states';

export const MIN_CALIBRATION_PAIRS = 8;

export interface IeltsCalibrationPair {
  assessmentId: string;
  aiBand: number;
  humanBand: number;
}

export interface IeltsCalibrationMetrics {
  pairs: number;
  meanAbsoluteError: number;
  exactAgreementRate: number;
  withinHalfBandRate: number;
  pearsonCorrelation: number | null;
  systematicBias: number; // mean(ai - human)
}

export type IeltsCalibrationReport =
  | {
      status: 'INSUFFICIENT_DATA';
      pairs: number;
      requiredPairs: number;
      metrics: null;
      note: string;
    }
  | {
      status: 'PRELIMINARY';
      pairs: number;
      requiredPairs: number;
      metrics: IeltsCalibrationMetrics;
      note: string;
    };

/** Filter to VALID pairs only — both bands legal, finite. Never upgrade data. */
export function validCalibrationPairs(pairs: readonly IeltsCalibrationPair[]): IeltsCalibrationPair[] {
  return pairs.filter(
    (p) =>
      typeof p.assessmentId === 'string' &&
      isValidBand(p.aiBand) &&
      isValidBand(p.humanBand),
  );
}

export function computeAgreementMetrics(pairs: readonly IeltsCalibrationPair[]): IeltsCalibrationMetrics | null {
  const valid = validCalibrationPairs(pairs);
  if (valid.length === 0) return null;

  const diffs = valid.map((p) => p.aiBand - p.humanBand);
  const abs = diffs.map((d) => Math.abs(d));
  const meanAbsoluteError = abs.reduce((a, b) => a + b, 0) / abs.length;
  const exact = valid.filter((p) => p.aiBand === p.humanBand).length / valid.length;
  const withinHalf = valid.filter((p) => Math.abs(p.aiBand - p.humanBand) <= 0.5).length / valid.length;
  const systematicBias = diffs.reduce((a, b) => a + b, 0) / diffs.length;

  let pearsonCorrelation: number | null = null;
  if (valid.length >= 2) {
    const aiValues = valid.map((p) => p.aiBand);
    const humanValues = valid.map((p) => p.humanBand);
    const aiMean = aiValues.reduce((a, b) => a + b, 0) / aiValues.length;
    const humanMean = humanValues.reduce((a, b) => a + b, 0) / humanValues.length;
    let numerator = 0;
    let aiSq = 0;
    let humanSq = 0;
    for (let i = 0; i < valid.length; i++) {
      const da = aiValues[i] - aiMean;
      const dh = humanValues[i] - humanMean;
      numerator += da * dh;
      aiSq += da * da;
      humanSq += dh * dh;
    }
    const denominator = Math.sqrt(aiSq * humanSq);
    pearsonCorrelation = denominator === 0 ? null : numerator / denominator;
  }

  return {
    pairs: valid.length,
    meanAbsoluteError,
    exactAgreementRate: exact,
    withinHalfBandRate: withinHalf,
    pearsonCorrelation,
    systematicBias,
  };
}

/**
 * Calibration status. Fewer than MIN_CALIBRATION_PAIRS real pairs ⇒
 * INSUFFICIENT_DATA and NO metrics are reported (even if some pairs exist —
 * partial data is not "calibration").
 */
export function computeCalibrationReport(pairs: readonly IeltsCalibrationPair[]): IeltsCalibrationReport {
  const valid = validCalibrationPairs(pairs);
  if (valid.length < MIN_CALIBRATION_PAIRS) {
    return {
      status: 'INSUFFICIENT_DATA',
      pairs: valid.length,
      requiredPairs: MIN_CALIBRATION_PAIRS,
      metrics: null,
      note: `Only ${valid.length} paired human marks; at least ${MIN_CALIBRATION_PAIRS} are required before ANY agreement metric is reported.`,
    };
  }
  const metrics = computeAgreementMetrics(valid);
  return {
    status: 'PRELIMINARY',
    pairs: valid.length,
    requiredPairs: MIN_CALIBRATION_PAIRS,
    metrics: metrics as IeltsCalibrationMetrics,
    note: 'Preliminary internal agreement analysis only — not an official IELTS validation and not a claim of marker equivalence.',
  };
}

/** Current subsystem calibration status: constant until real paired data exists.
 *  When real pairs are supplied, delegates to the report — the frozen constant
 *  is only returned when there is no evidence to analyse. */
export function currentCalibrationStatus(pairs?: readonly IeltsCalibrationPair[]) {
  if (!pairs || pairs.length === 0) return IELTS_CALIBRATION_STATUS;
  return computeCalibrationReport(pairs).status;
}
