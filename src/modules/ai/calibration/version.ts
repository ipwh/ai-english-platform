// ============================================
// R3.10-K Phase 7: Calibration Version Identity
//
// Explicit version constants for the calibration machinery and its
// dataset. Deliberately SEPARATE from:
//   - scoringVersion  (writing-score-policy.ts — canonical scoring)
//   - generationVersion (writing-artifact.ts — model essay generation)
//   - prompt versions  (prompt-registry.ts — per-prompt versions)
//
// These constants identify WHAT is being measured, never the scoring
// semantics themselves.
// ============================================

import { createHash } from "node:crypto";

/** Version of the calibration machinery (runner/metrics/gates/report). */
export const CALIBRATION_VERSION = "CALIBRATION_V1";

/**
 * Version of the calibration dataset. The dataset is git-tracked and
 * hash-protected per fixture; this constant marks the overall dataset
 * shape. Per-run identity is provided by `datasetFingerprint`.
 */
export const CALIBRATION_DATASET_VERSION = "CALIBRATION_DATASET_V1";

/**
 * Deterministic fingerprint over fixture ids + source hashes.
 * Same fixture set → same fingerprint; any fixture mutation changes it.
 * Null for an empty fixture set.
 */
export function computeDatasetFingerprint(
  entries: Array<{ id: string; sourceHash: string }>,
): string | null {
  if (entries.length === 0) return null;
  const sorted = [...entries]
    .map(e => `${e.id}|${e.sourceHash}`)
    .sort();
  return createHash("sha256").update(sorted.join("\n")).digest("hex");
}
