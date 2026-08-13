// ============================================
// Canonical Paper 2 Writing Scoring Policy — SINGLE SOURCE OF TRUTH
// ============================================
// This module is the ONE canonical authority for deterministic Paper 2
// Writing score computation. Every formula here carries an explicit
// authority classification:
//
//   OFFICIAL_HKEAA     — directly supported by the official HKDSE Paper 2
//                        Marking Scheme / Level Descriptors materials.
//   OFFICIAL_DERIVED   — follows mathematically from an official rule
//                        without introducing a new policy choice.
//   PLATFORM_DEFINED   — platform policy with NO official formula
//                        (must never be presented as an HKEAA rule).
//
// SCORING VERSION:
//   Any change to the rubric, normalization, conversion, penalty, or
//   level-estimation policy MUST increment SCORING_VERSION explicitly.
//   Human-marker calibration MUST NOT silently mutate this version —
//   calibration only compares against it.
// ============================================

/** Canonical scoring contract version (rubric + normalization + conversion + penalty + level policy). */
export const SCORING_VERSION = "HKDSE_P2_WRITING_CANONICAL_V1" as const;

/** Internal platform level estimate — NEVER an official HKEAA grade (no 5* / 5**). */
export type EstimatedDSELevel = "1" | "2" | "3" | "4" | "5";

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Normalize a rubric criterion score.
 * PLATFORM_DEFINED: clamp to [0,7] and round to 0.5 increments.
 * HKEAA publishes integer 0–7 bands; half-point scoring is a platform
 * normalization policy and is NOT an official HKEAA rule.
 */
export function normalizeRubricScore(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const clamped = clamp(value, 0, 7);
  return Math.round(clamped * 2) / 2;
}

/**
 * CLO total = C + L + O.
 * OFFICIAL_DERIVED: each criterion has an official 0–7 band; the sum 0–21
 * is the arithmetic consequence (official two-marker reporting = 2 × 21 = 42).
 * Returns undefined unless ALL three criteria are present — missing evidence
 * must never become a numeric score.
 */
export function computeCloTotal(
  contentScore: number | undefined,
  languageScore: number | undefined,
  organizationScore: number | undefined,
): number | undefined {
  if (
    contentScore == null ||
    languageScore == null ||
    organizationScore == null
  ) {
    return undefined;
  }
  return contentScore + languageScore + organizationScore;
}

/**
 * CLO total → 0–100 presentation score.
 * PLATFORM_DEFINED: `round(cloTotal / 21 * 100)`.
 * HKEAA does NOT define any CLO-to-percentage conversion.
 */
export function cloTotalToOverall100(cloTotal: number): number {
  return Math.round((cloTotal / 21) * 100);
}

/**
 * Deterministic length-penalty tiers (PLATFORM_DEFINED policy).
 * The official Marking Scheme only states that length alone should not gain
 * marks; it defines NO penalty tiers.
 */
export function deterministicLengthPenalty(ratio: number | null): number {
  if (ratio === null) return 0;
  if (ratio < 0.3) return -25;
  if (ratio < 0.5) return -15;
  if (ratio < 0.7) return -8;
  return 0;
}

/**
 * Combine LLM-suggested penalty with the deterministic platform penalty.
 * PLATFORM_DEFINED policy: the LLM may only be LESS severe than the
 * deterministic tier (Math.max — both values are ≤ 0).
 * The penalty is applied exactly once, to the overall score only.
 */
export function applyLengthPenaltyPolicy(
  llmLengthPenalty: number,
  deterministicPenalty: number,
): number {
  return Math.max(llmLengthPenalty, deterministicPenalty);
}

/**
 * CLO total → internal platform level estimate (1–5).
 * PLATFORM_DEFINED thresholds (13/10/7/4). HKEAA publishes Level 1–5
 * DESCRIPTORS only; it defines NO numeric CLO-to-level conversion and
 * publishes no grade boundaries. Never returns 5* / 5**.
 */
export function estimateDSELevelFromCLO(cloTotalScore: number): EstimatedDSELevel {
  if (cloTotalScore >= 13) return "5";
  if (cloTotalScore >= 10) return "4";
  if (cloTotalScore >= 7) return "3";
  if (cloTotalScore >= 4) return "2";
  return "1";
}

/** Clamp a numeric value into the accepted platform level labels (1–5). */
export function toEstimatedDSELevel(value: unknown): EstimatedDSELevel | undefined {
  if (value === "1" || value === "2" || value === "3" || value === "4" || value === "5") {
    return value;
  }
  return undefined;
}
