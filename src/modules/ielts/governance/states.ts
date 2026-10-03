// ============================================
// IELTS Governance States — evidence classes that CANNOT self-upgrade
// ============================================
// See docs/ielts/IELTS_ASSESSMENT_GOVERNANCE.md.
//
// These states reflect the real world, not software ambition:
//   * no human-marker data exists for the IELTS subsystem
//   * therefore CALIBRATED_HUMAN_VALIDATED is impossible to produce
//   * pronunciation has no acoustic analysis — NOT_VERIFIED
//   * monetary AI cost is not reliably instrumented — UNKNOWN
//
// The software MUST NOT automatically upgrade any of these states. Only a
// reviewed change with real evidence (human marks) may edit the constants.
// ============================================

import type {
  IeltsAssessmentSource,
  IeltsFeatureStatus,
  IeltsHumanEvidenceState,
  IeltsMarkerEquivalenceState,
} from '../domain/types';

/** Frozen until REAL human-marker data is ingested and reviewed. */
export const IELTS_HUMAN_EVIDENCE: IeltsHumanEvidenceState = 'INSUFFICIENT';
export const IELTS_MARKER_EQUIVALENCE: IeltsMarkerEquivalenceState = 'UNPROVEN';
export const IELTS_CALIBRATION_STATUS = 'INSUFFICIENT_DATA' as const;

/**
 * Subsystem maturity label (2026-10-03 IV): **BETA**.
 * HUMAN_EVIDENCE = INSUFFICIENT means no human-marker calibration exists; the
 * automated safeguards (machine screen + blind-solve verification + human
 * approval before publication) are in place, but the feature must present
 * itself as a test/beta feature — never as a validated or official service.
 * Surfaced in the UI and by GET /api/ielts/status.
 */
export const IELTS_SUBSYSTEM_STATUS = 'BETA' as const;
export const IELTS_SUBSYSTEM_STATUS_REASON =
  'BETA: no human-marker calibration yet (HUMAN_EVIDENCE = INSUFFICIENT); scores and generated content are practice material only.';

/** Feature statuses exposed through /api/ielts/status (never overstated). */
export const IELTS_FEATURE_STATUS: Readonly<Record<string, IeltsFeatureStatus>> = {
  objectiveScoring: 'IMPLEMENTED',
  writingAiAssessment: 'IMPLEMENTED', // as AI estimate; not calibrated
  speakingPreparation: 'IMPLEMENTED', // plan / language functions / practice questions (no score)
  // 2026-10-03 (II) product decision: Speaking is NOT scored, no examiner
  // simulation, no pronunciation judgement. See docs/ielts/IELTS_ASSESSMENT_GOVERNANCE.md.
  speakingAssessment: 'NOT_AVAILABLE',
  speakingPronunciationAssessment: 'NOT_AVAILABLE',
  listeningProductionAudioAssets: 'PARTIALLY_IMPLEMENTED', // platform TTS only
  aiQuestionGeneration: 'IMPLEMENTED', // BETA: machine screen + blind-solve verified; QA_REQUIRED until human approval
  humanCalibration: 'NOT_CALIBRATED',
  writingCalibration: 'NOT_CALIBRATED',
  officialScoringEquivalence: 'NOT_VERIFIED',
};

/** Monetary AI cost telemetry is not reliably instrumented — do not invent numbers. */
export const IELTS_AI_COST_STATUS = 'UNKNOWN' as const;

/**
 * The ONLY assessment source the platform may mint while human evidence is
 * insufficient. CALIBRATED_HUMAN_VALIDATED is guarded (and covered by a test).
 */
export function resolveAssessmentSourceGate(
  humanEvidence: IeltsHumanEvidenceState = IELTS_HUMAN_EVIDENCE,
): IeltsAssessmentSource {
  if (humanEvidence === 'SUFFICIENT_FOR_INTERNAL_VALIDATION') {
    // Even then, only an explicit calibration review may upgrade sources; the
    // default remains AI_ESTIMATE. Callers must pass an explicit override that
    // is itself gated by calibration records.
    return 'AI_ESTIMATE';
  }
  return 'AI_ESTIMATE';
}

/**
 * Guard against fabricating calibrated assessments. Returns true only when the
 * caller can PROVE real human pairing evidence (>= min pairs with human bands).
 */
export function isCalibratedSourceAllowed(pairedHumanMarks: number, minimumPairs = 8): boolean {
  return pairedHumanMarks >= minimumPairs && IELTS_HUMAN_EVIDENCE === 'SUFFICIENT_FOR_INTERNAL_VALIDATION';
}

export interface IeltsGovernanceSnapshot {
  humanEvidence: IeltsHumanEvidenceState;
  markerEquivalence: IeltsMarkerEquivalenceState;
  calibrationStatus: typeof IELTS_CALIBRATION_STATUS;
  aiCost: typeof IELTS_AI_COST_STATUS;
  /** BETA while no human-marker calibration exists. */
  subsystemStatus: typeof IELTS_SUBSYSTEM_STATUS;
  featureStatus: Readonly<Record<string, IeltsFeatureStatus>>;
  disclaimers: string[];
}

export function getGovernanceSnapshot(): IeltsGovernanceSnapshot {
  return {
    humanEvidence: IELTS_HUMAN_EVIDENCE,
    markerEquivalence: IELTS_MARKER_EQUIVALENCE,
    calibrationStatus: IELTS_CALIBRATION_STATUS,
    aiCost: IELTS_AI_COST_STATUS,
    subsystemStatus: IELTS_SUBSYSTEM_STATUS,
    featureStatus: IELTS_FEATURE_STATUS,
    disclaimers: [
      'IELTS-style practice — not an official IELTS test.',
      'BETA: no human-marker calibration yet (HUMAN_EVIDENCE = INSUFFICIENT); scores and generated content are practice material only.',
      'Band values are practice estimates produced by this platform.',
      'AI-assisted feedback is not an official IELTS score and is not equivalent to a certified examiner.',
      'Speaking is preparation coaching only: no Speaking score, no examiner simulation, no pronunciation judgement.',
      'AI-generated practice content is machine-screened and blind-solve verified, but can only be published after human review.',
      'HUMAN_EVIDENCE = INSUFFICIENT; marker equivalence is UNPROVEN.',
    ],
  };
}

/** Wording screen for serving code + UI copy (docs §11 of governance). */
export const IELTS_FORBIDDEN_CLAIM_PATTERNS: readonly RegExp[] = [
  /official\s+IELTS\s+score/i,
  /certified\s+IELTS\s+examiner/i,
  /guaranteed\s+(IELTS\s+)?band/i,
  /official\s+IELTS\s+assessment/i,
];

export function containsForbiddenClaim(text: string): boolean {
  return IELTS_FORBIDDEN_CLAIM_PATTERNS.some((re) => re.test(text));
}
