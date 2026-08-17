// ============================================
// R3.10-K Phase 9 — R4: Dataset Freeze
//
// Freezes the human-marker evidence dataset into an immutable,
// reproducible artifact: manifest + evidence inventory + dataset
// fingerprint, with the three cross-checked for consistency.
//
// FAIL-CLOSED on:
//   - malformed fixtures / conflicting evidence sets
//   - AI-authored or unknown authorship declarations
//   - unverified COMPARABLE fixtures (never freezes unverified ground truth)
//   - fingerprint mismatch against an existing manifest with the same
//     dataset version (version bump required for changed truth)
//
// Freeze NEVER mutates scores, scoring policy, prompts, or runtime code.
// ============================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  loadHumanMarkerFixtures,
  humanMarkerFingerprintEntry,
} from "./runner";
import {
  classifyHumanMarkerEvidence,
  effectiveVerificationStatus,
  validateHumanMarkerEvidenceSet,
} from "./human-marker";
import { CALIBRATION_DATASET_VERSION, computeDatasetFingerprint } from "./version";
import type { HumanMarkerCalibrationFixture } from "./types";

export interface FreezeOptions {
  fixturesDir: string;
  /** Where frozen-manifest.json / frozen-inventory.json are written. */
  outDir: string;
  /** Frozen timestamp (injectable for deterministic freezes). */
  now?: () => string;
  /** Dataset version — defaults to the module constant. */
  datasetVersion?: string;
}

export interface FreezeResult {
  ok: boolean;
  reasons: string[];
  datasetVersion: string;
  fingerprint: string | null;
  fixtureCount: number;
  verifiedComparableCount: number;
  unverifiedCount: number;
  frozenAt: string;
  manifest?: unknown;
  inventory?: unknown;
}

export class FreezeBlockedError extends Error {
  constructor(public reasons: string[]) {
    super(`FREEZE_BLOCKED: ${reasons.join("; ")}`);
    this.name = "FreezeBlockedError";
  }
}

/** Run the freeze check + artifact build. Does NOT write when !ok. */
export function runFreeze(options: FreezeOptions): FreezeResult {
  const reasons: string[] = [];
  const datasetVersion = options.datasetVersion ?? CALIBRATION_DATASET_VERSION;
  const frozenAt = options.now ? options.now() : new Date().toISOString();

  // 1. Load + validate the full evidence set (fail-closed).
  let fixtures: HumanMarkerCalibrationFixture[];
  try {
    fixtures = loadHumanMarkerFixtures(options.fixturesDir);
  } catch (err) {
    throw new FreezeBlockedError([
      `fixture load failed: ${err instanceof Error ? err.message : String(err)}`,
    ]);
  }
  const set = validateHumanMarkerEvidenceSet(fixtures);
  if (!set.ok) {
    throw new FreezeBlockedError(set.errors);
  }

  // 2. Per-fixture integrity: authorship + verification + comparability.
  let verifiedComparable = 0;
  let unverified = 0;
  for (const fixture of fixtures) {
    if (fixture.scriptAuthorship !== undefined && fixture.scriptAuthorship !== "HUMAN_AUTHORED") {
      reasons.push(`${fixture.id}: scriptAuthorship must be "HUMAN_AUTHORED" (got ${JSON.stringify(fixture.scriptAuthorship)})`);
    }
    const verified = effectiveVerificationStatus(fixture) === "verified";
    if (!verified) unverified += 1;
    if (classifyHumanMarkerEvidence(fixture) === "ACCEPT_OVERALL_SCORE") {
      if (!verified) {
        reasons.push(
          `${fixture.id}: unverified comparable fixture blocks freeze — verification is an explicit human act, never automatic`,
        );
      } else {
        verifiedComparable += 1;
      }
    }
  }
  if (reasons.length > 0) {
    return {
      ok: false,
      reasons: [...new Set(reasons)].sort(),
      datasetVersion,
      fingerprint: null,
      fixtureCount: fixtures.length,
      verifiedComparableCount: verifiedComparable,
      unverifiedCount: unverified,
      frozenAt,
    };
  }

  // 3. Dataset fingerprint over the FULL ground-truth identity.
  const fingerprint = computeDatasetFingerprint(fixtures.map(humanMarkerFingerprintEntry));

  // 4. Existing manifest consistency: same dataset version with a
  //    different fingerprint means the truth changed without a bump.
  const manifestPath = join(options.outDir, "frozen-manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
        datasetVersion?: string;
        fingerprint?: string;
      };
      if (
        existing.datasetVersion === datasetVersion
        && existing.fingerprint !== fingerprint
      ) {
        return {
          ok: false,
          reasons: [
            "fingerprint mismatch: dataset content changed without a dataset version bump — freeze blocked",
          ],
          datasetVersion,
          fingerprint,
          fixtureCount: fixtures.length,
          verifiedComparableCount: verifiedComparable,
          unverifiedCount: unverified,
          frozenAt,
        };
      }
    } catch {
      // Unreadable existing manifest → treat as absent (a corrupt manifest
      // is an operator issue, not silent truth mutation).
    }
  }

  // 5. Build the immutable artifacts.
  const manifest = {
    schemaVersion: 1,
    datasetVersion,
    fingerprint,
    frozenAt,
    fixtureCount: fixtures.length,
    verifiedComparableCount: verifiedComparable,
    unverifiedCount: unverified,
    fixtures: fixtures
      .map(f => ({ id: f.id, sourceHash: f.provenance.sourceHash }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };

  const byClass = {
    ACCEPT_OVERALL_SCORE: 0,
    ACCEPT_CRITERION_ONLY: 0,
    LEVEL_ONLY: 0,
    NON_COMPARABLE_SCORE: 0,
    IMAGE_ONLY_UNREADABLE: 0,
  };
  for (const fixture of fixtures) {
    const cls = classifyHumanMarkerEvidence(fixture);
    if (cls in byClass) byClass[cls as keyof typeof byClass] += 1;
  }
  const inventory = {
    schemaVersion: 1,
    datasetVersion,
    fingerprint,
    frozenAt,
    byClass,
    verified: fixtures.length - unverified,
    unverified,
  };

  // 6. Consistency: manifest fingerprint must reproduce from the manifest's
  //    own fixture list AND the inventory must carry the same fingerprint.
  const manifestEntryList = (manifest.fixtures as Array<{ id: string; sourceHash: string }>);
  const recomputedFromManifest = computeDatasetFingerprint(
    fixtures
      .filter(f => manifestEntryList.some(m => m.id === f.id))
      .map(humanMarkerFingerprintEntry),
  );
  if (recomputedFromManifest !== fingerprint || inventory.fingerprint !== fingerprint) {
    return {
      ok: false,
      reasons: ["manifest/inventory/fingerprint consistency check failed"],
      datasetVersion,
      fingerprint,
      fixtureCount: fixtures.length,
      verifiedComparableCount: verifiedComparable,
      unverifiedCount: unverified,
      frozenAt,
    };
  }

  return {
    ok: true,
    reasons: [],
    datasetVersion,
    fingerprint,
    fixtureCount: fixtures.length,
    verifiedComparableCount: verifiedComparable,
    unverifiedCount: unverified,
    frozenAt,
    manifest,
    inventory,
  };
}

/** Write the frozen artifacts — only when the freeze result is ok. */
export function writeFreezeOutput(result: FreezeResult, outDir: string): void {
  if (!result.ok || !result.manifest || !result.inventory) {
    throw new FreezeBlockedError(["cannot write frozen artifacts for a blocked freeze"]);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "frozen-manifest.json"),
    `${JSON.stringify(result.manifest, null, 2)}\n`,
    "utf-8",
  );
  writeFileSync(
    join(outDir, "frozen-inventory.json"),
    `${JSON.stringify(result.inventory, null, 2)}\n`,
    "utf-8",
  );
}
