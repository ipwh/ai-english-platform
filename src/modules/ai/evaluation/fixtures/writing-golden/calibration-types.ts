// ============================================
// Sprint 131: Writing Calibration Fixture Types
// For human-marker calibration of AI scoring.
// NO scores are fabricated — all expected values are null
// until reviewed by HKDSE English teachers.
//
// NOTE: The golden-runner.ts loads all .json files and maps them
// to the GoldenFixture interface (see golden-runner.ts):
//   - task          → taskPrompt in calibration context
//   - studentDraft  → studentEssay in calibration context
//   - expected.{contentScore,languageScore,organizationScore} → null
//   - annotations.{contentRationale,languageRationale,organizationRationale} → null
//   - metadata.{difficulty,caseType,source,markerCount}
//
// Calibration fixtures use the SAME field names as GoldenFixture
// (task, studentDraft) for direct loading by the golden runner.
// ============================================

/** source of the calibration fixture. */
export type CalibrationSource =
  | "synthetic-draft"
  | "real-student-anonymized"
  | "teacher-created";

/** review status of a calibration fixture. */
export type CalibrationStatus =
  | "awaiting-human-marking"
  | "partially-reviewed"
  | "teacher-reviewed";

/** Expected scores — always null until teacher-reviewed. */
interface NullableScores {
  contentScore: number | null;
  languageScore: number | null;
  organizationScore: number | null;
}

/** Shape of a calibration fixture as loaded by golden-runner.ts */
export interface WritingCalibrationFixture {
  id: string;
  task: string;
  studentDraft: string;
  textType?: string;
  source: CalibrationSource;
  calibrationStatus: CalibrationStatus;
  expected: NullableScores & { overallScore?: number | null };
  annotations?: {
    requirementCoverage?: string;
    contentRationale: string | null;
    languageRationale: string | null;
    organizationRationale: string | null;
  };
  metadata?: {
    difficulty?: "remedial" | "core" | "challenge";
    caseType?: string;
    source?: string;
    markerCount?: number;
  };
  notes?: string;
}

/** Current calibration categories — all 12 fixture placeholder essays exist */
export const CALIBRATION_CATEGORIES = [
  "fully-developed",
  "partial-task-fulfilment",
  "off-topic",
  "strong-content-weak-language",
  "weak-content-strong-language",
  "relevant-underdeveloped",
  "repetitive-ideas",
  "accurate-simple-language",
  "sophisticated-inappropriate-vocabulary",
  "non-blocking-grammar-errors",
  "meaning-blocking-grammar-errors",
  "organized-but-weak-progression",
] as const;

export type CalibrationCategory = (typeof CALIBRATION_CATEGORIES)[number];

