// ============================================
// R3.10-K Phase 3 — Canonical Writing Score Policy Tests
// The scoring formulas in writing-score-policy.ts are the SINGLE
// authoritative source; these tests lock the contract and the invariants.
// ============================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  SCORING_VERSION,
  clamp,
  normalizeRubricScore,
  computeCloTotal,
  cloTotalToOverall100,
  deterministicLengthPenalty,
  applyLengthPenaltyPolicy,
  estimateDSELevelFromCLO,
  toEstimatedDSELevel,
} from "../core/writing-score-policy";

describe("Invariant — C/L/O each ∈ [0,7] (normalizeRubricScore)", () => {
  it("clamps to [0,7] for any finite input", () => {
    expect(normalizeRubricScore(-100)).toBe(0);
    expect(normalizeRubricScore(1e9)).toBe(7);
    expect(normalizeRubricScore(0)).toBe(0);
    expect(normalizeRubricScore(7)).toBe(7);
  });

  it("returns undefined for non-finite input (never coerces to a number)", () => {
    expect(normalizeRubricScore(NaN)).toBeUndefined();
    expect(normalizeRubricScore(Infinity)).toBeUndefined();
    expect(normalizeRubricScore(-Infinity)).toBeUndefined();
    expect(normalizeRubricScore("4")).toBeUndefined();
    expect(normalizeRubricScore(null)).toBeUndefined();
    expect(normalizeRubricScore(undefined)).toBeUndefined();
  });

  it("is deterministic: same input → same output (0.5-increment normalization)", () => {
    for (const v of [0.24, 0.25, 4.2, 4.3, 6.75, 6.8]) {
      expect(normalizeRubricScore(v)).toBe(normalizeRubricScore(v));
    }
    expect(normalizeRubricScore(0.25)).toBe(0.5);
    expect(normalizeRubricScore(4.3)).toBe(4.5);
  });
});

describe("Invariant — cloTotal = C+L+O ∈ [0,21]", () => {
  it("sums the three criteria", () => {
    expect(computeCloTotal(7, 7, 7)).toBe(21);
    expect(computeCloTotal(0, 0, 0)).toBe(0);
    expect(computeCloTotal(3.5, 2.5, 1)).toBe(7);
  });

  it("is undefined when ANY criterion is missing (never becomes 0)", () => {
    expect(computeCloTotal(5, undefined, 5)).toBeUndefined();
    expect(computeCloTotal(undefined, 5, 5)).toBeUndefined();
    expect(computeCloTotal(5, 5, undefined)).toBeUndefined();
    expect(computeCloTotal(undefined, undefined, undefined)).toBeUndefined();
  });
});

describe("Invariant — canonicalOverallScore ∈ [0,100] and deterministic", () => {
  it("maps cloTotal through round(cloTotal/21×100) inside [0,100]", () => {
    expect(cloTotalToOverall100(21)).toBe(100);
    expect(cloTotalToOverall100(0)).toBe(0);
    expect(cloTotalToOverall100(12)).toBe(57);
    expect(cloTotalToOverall100(3)).toBe(14);
  });

  it("is deterministic from canonical inputs", () => {
    for (let i = 0; i <= 42; i += 0.5) {
      const clo = Math.min(21, i);
      expect(cloTotalToOverall100(clo)).toBe(cloTotalToOverall100(clo));
    }
  });
});

describe("Length penalty — PLATFORM_DEFINED, applied once, never double", () => {
  it("tiers: ≥0.7→0, 0.5–0.7→−8, 0.3–0.5→−15, <0.3→−25, null→0", () => {
    expect(deterministicLengthPenalty(null)).toBe(0);
    expect(deterministicLengthPenalty(0.7)).toBe(0);
    expect(deterministicLengthPenalty(0.5)).toBe(-8);
    expect(deterministicLengthPenalty(0.3)).toBe(-15);
    expect(deterministicLengthPenalty(0.299)).toBe(-25);
    expect(deterministicLengthPenalty(0.699)).toBe(-8);
    expect(deterministicLengthPenalty(0.499)).toBe(-15);
  });

  it("exact boundaries: one side of each threshold", () => {
    expect(deterministicLengthPenalty(0.699999)).toBe(-8);
    expect(deterministicLengthPenalty(0.7)).toBe(0);
    expect(deterministicLengthPenalty(0.5)).toBe(-8);
    expect(deterministicLengthPenalty(0.499999)).toBe(-15);
    expect(deterministicLengthPenalty(0.3)).toBe(-15);
    expect(deterministicLengthPenalty(0.299999)).toBe(-25);
  });

  it("LLM penalty cannot be more severe than deterministic (Math.max policy)", () => {
    expect(applyLengthPenaltyPolicy(-50, -15)).toBe(-15);
    expect(applyLengthPenaltyPolicy(-5, -15)).toBe(-5);
    expect(applyLengthPenaltyPolicy(0, -25)).toBe(0);
    expect(applyLengthPenaltyPolicy(0, 0)).toBe(0);
  });

  it("single application: policy returns ONE value (no stacking)", () => {
    // Contract: analyzeWriting calls applyLengthPenaltyPolicy exactly once.
    const applied = applyLengthPenaltyPolicy(-8, -15);
    expect(applied).toBe(-8); // not -23
  });
});

describe("Level estimate — PLATFORM_DEFINED internal 1–5 only", () => {
  it("thresholds 16/13/10/7", () => {
    expect(estimateDSELevelFromCLO(21)).toBe("5");
    expect(estimateDSELevelFromCLO(16)).toBe("5");
    expect(estimateDSELevelFromCLO(15.5)).toBe("4");
    expect(estimateDSELevelFromCLO(13)).toBe("4");
    expect(estimateDSELevelFromCLO(12.5)).toBe("3");
    expect(estimateDSELevelFromCLO(10)).toBe("3");
    expect(estimateDSELevelFromCLO(9.5)).toBe("2");
    expect(estimateDSELevelFromCLO(7)).toBe("2");
    expect(estimateDSELevelFromCLO(6.99)).toBe("1");
    expect(estimateDSELevelFromCLO(4)).toBe("1");
    expect(estimateDSELevelFromCLO(0)).toBe("1");
  });

  it("never returns 5* / 5** / U / Level-prefixed strings", () => {
    for (let i = 0; i <= 21; i++) {
      const level = estimateDSELevelFromCLO(i);
      expect(["1", "2", "3", "4", "5"]).toContain(level);
    }
  });

  it("toEstimatedDSELevel accepts only 1–5 labels", () => {
    expect(toEstimatedDSELevel("1")).toBe("1");
    expect(toEstimatedDSELevel("5")).toBe("5");
    expect(toEstimatedDSELevel("5*")).toBeUndefined();
    expect(toEstimatedDSELevel("5**")).toBeUndefined();
    expect(toEstimatedDSELevel("Level 4")).toBeUndefined();
    expect(toEstimatedDSELevel("U")).toBeUndefined();
  });
});

describe("Scoring version", () => {
  it("is the explicit canonical version", () => {
    expect(SCORING_VERSION).toBe("HKDSE_P2_WRITING_CANONICAL_V3");
  });
});

describe("Guard — no numeric score fallback exists in the canonical scorer", () => {
  it("analyze-writing.ts contains no `: 70` / `?? 70` default", () => {
    const src = readFileSync(
      join(__dirname, "..", "usecases", "analyze-writing.ts"),
      "utf-8",
    );
    expect(src).not.toMatch(/\?\?\s*70/);
    expect(src).not.toMatch(/:\s*70\s*;/);
    expect(src).not.toContain("llmBaseScore");
  });

  it("analyze-writing.ts never imports the calibration module (human-marker isolation)", () => {
    const src = readFileSync(
      join(__dirname, "..", "usecases", "analyze-writing.ts"),
      "utf-8",
    );
    expect(src).not.toMatch(/from\s+['"][^'"]*calibration[^'"]*['"]/);
    expect(src).not.toMatch(/require\(['"][^'"]*calibration[^'"]*['"]\)/);
  });

  it("clamp keeps every final score inside [0,100]", () => {
    const finalize = (base: number, penalty: number) =>
      clamp(Math.round(base + penalty), 0, 100);
    expect(finalize(110, 0)).toBe(100);
    expect(finalize(-20, 0)).toBe(0);
    expect(finalize(100, -25)).toBe(75);
  });
});
