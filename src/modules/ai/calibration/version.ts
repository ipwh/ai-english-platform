// ============================================
// R3.10-K Phase 8: Calibration Version Identity
//
// Explicit version constants for the calibration machinery and its
// dataset. Deliberately SEPARATE from:
//   - scoringVersion  (writing-score-policy.ts — canonical scoring)
//   - generationVersion (writing-artifact.ts — model essay generation)
//   - prompt versions  (prompt-registry.ts — per-prompt versions)
//
// P0 FIX (Phase 8): the dataset fingerprint now covers the FULL
// ground-truth identity — marker scores, published level, rubric
// version, verification state, marker identity, adjudication — so
// that ANY ground-truth mutation changes the fingerprint. Same
// fingerprint + different ground truth is structurally impossible.
// ============================================

import { createHash } from "node:crypto";

/** Version of the calibration machinery (runner/metrics/gates/report). */
export const CALIBRATION_VERSION = "CALIBRATION_V1";

/**
 * Version of the calibration dataset identity shape.
 * V2 = fingerprint covers marker scores / rubric / verification state
 * (Phase 8 P0 fix). The dataset is git-tracked and hash-protected per
 * fixture; this constant marks the overall dataset shape. Per-run
 * identity is provided by `computeDatasetFingerprint`.
 */
export const CALIBRATION_DATASET_VERSION = "CALIBRATION_DATASET_V2";

/** One ground-truth identity entry for dataset fingerprinting. */
export interface DatasetFingerprintEntry {
  id: string;
  sourceHash: string;
  contentScore: number | null;
  languageScore: number | null;
  organizationScore: number | null;
  overallScore: number | null;
  publishedLevel: string | null;
  rubricVersion: string;
  verificationStatus: string | null;
  /** Phase 9: verification audit fields move the fingerprint too. */
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  scriptAuthorship?: string | null;
  /**
   * Phase 8 Step 4 (P2-A): semantic comparability metadata. These
   * fields change whether the evidence can be treated as the same
   * comparable ground truth — they MUST move the fingerprint.
   */
  taskPartScope?: string | null;
  comparabilityNotes?: string | null;
  /** Verbatim published sub-scores (e.g. M1/M2) — provenance records. */
  subScores?: Array<{ label: string; value: number | string }>;
  /** Independent marker score entries (Phase 8 inter-rater schema). */
  markerScores?: Array<{
    markerId: string;
    contentScore: number | null;
    languageScore: number | null;
    organizationScore: number | null;
    overallScore: number | null;
    markedAt: string | null;
  }>;
  /** Adjudication state (Phase 8 inter-rater schema). */
  adjudication?: {
    status: string;
    adjudicatorId: string | null;
    resolvedAt: string | null;
    notes: string | null;
  };
}

/** Canonical numeric/null projection — locale-independent, whitespace-free. */
function canonNum(v: number | null | undefined): string {
  return v === null || v === undefined ? "null" : String(v);
}

/** Canonical string/null projection. */
function canonStr(v: string | null | undefined): string {
  return v === null || v === undefined || v === "" ? "null" : v;
}

/** Canonical projection of one entry — fixed field order, no insertion-order dependence. */
function canonicalProjection(e: DatasetFingerprintEntry): string {
  const subScores = e.subScores
    ? JSON.stringify(
      [...e.subScores]
        .map(s => [s.label, String(s.value)] as const)
        .sort((a, b) => a[0].localeCompare(b[0])),
    )
    : "null";
  const markerScores = e.markerScores
    ? JSON.stringify(
      [...e.markerScores]
        .map(m => ({
          markerId: m.markerId,
          contentScore: canonNum(m.contentScore),
          languageScore: canonNum(m.languageScore),
          organizationScore: canonNum(m.organizationScore),
          overallScore: canonNum(m.overallScore),
          markedAt: canonStr(m.markedAt),
        }))
        .sort((a, b) => `${a.markerId}|${a.markedAt}`.localeCompare(`${b.markerId}|${b.markedAt}`)),
    )
    : "null";
  const adjudication = e.adjudication
    ? JSON.stringify({
      status: e.adjudication.status,
      adjudicatorId: canonStr(e.adjudication.adjudicatorId),
      resolvedAt: canonStr(e.adjudication.resolvedAt),
      notes: canonStr(e.adjudication.notes),
    })
    : "null";

  return [
    e.id,
    e.sourceHash,
    canonNum(e.contentScore),
    canonNum(e.languageScore),
    canonNum(e.organizationScore),
    canonNum(e.overallScore),
    canonStr(e.publishedLevel),
    e.rubricVersion,
    canonStr(e.verificationStatus),
    canonStr(e.verifiedBy),
    canonStr(e.verifiedAt),
    canonStr(e.scriptAuthorship),
    canonStr(e.taskPartScope),
    canonStr(e.comparabilityNotes),
    subScores,
    markerScores,
    adjudication,
  ].join("\u0000");
}

/**
 * Deterministic fingerprint over the FULL ground-truth identity of the
 * dataset. ANY mutation of marker scores, published level, rubric
 * version, verification state, marker identity, or adjudication state
 * changes the fingerprint. Null for an empty dataset.
 */
export function computeDatasetFingerprint(
  entries: DatasetFingerprintEntry[],
): string | null {
  if (entries.length === 0) return null;
  const canonical = entries.map(canonicalProjection).sort();
  return createHash("sha256").update(canonical.join("\n")).digest("hex");
}
