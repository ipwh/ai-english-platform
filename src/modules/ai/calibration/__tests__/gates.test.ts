// ============================================
// R3.10-F: Calibration Gate Tests
//
// Covers Phase 8 items:
//   13. insufficient-data state
//   14. calibration failure gate
// ============================================

import { describe, it, expect } from "vitest";
import { evaluateCalibrationGates } from "../gates";
import type { CalibrationMetrics, CalibrationGatePolicy } from "../types";
import { DEFAULT_CALIBRATION_GATE_POLICY } from "../types";

function emptyMetrics(): CalibrationMetrics {
  return {
    overall: { n: 0, mae: null, rmse: null, meanBias: null, exactAgreementRate: null, withinOneAgreementRate: null, overScoringRate: null, underScoringRate: null },
    perCriterion: {
      content: { n: 0, mae: null, rmse: null, meanBias: null, exactAgreementRate: null, withinOneAgreementRate: null, overScoringRate: null, underScoringRate: null },
      language: { n: 0, mae: null, rmse: null, meanBias: null, exactAgreementRate: null, withinOneAgreementRate: null, overScoringRate: null, underScoringRate: null },
      organization: { n: 0, mae: null, rmse: null, meanBias: null, exactAgreementRate: null, withinOneAgreementRate: null, overScoringRate: null, underScoringRate: null },
    },
    perLevel: [],
    perYear: [],
    perTask: [],
    perMarkerPolicy: [],
    levelMetrics: { n: 0, meanAbsoluteDistance: null, maxAbsoluteDistance: null, withinOneLevelRate: null },
  };
}

function goodMetrics(): CalibrationMetrics {
  const m = emptyMetrics();
  m.overall = { n: 20, mae: 0.5, rmse: 0.8, meanBias: 0.2, exactAgreementRate: 0.6, withinOneAgreementRate: 0.9, overScoringRate: 0.2, underScoringRate: 0.2 };
  return m;
}

function input(overrides: { sampleCount?: number; scoredCount?: number; metrics?: CalibrationMetrics; policy?: CalibrationGatePolicy } = {}) {
  return {
    sampleCount: overrides.sampleCount ?? 20,
    scoredCount: overrides.scoredCount ?? 20,
    policy: overrides.policy ?? DEFAULT_CALIBRATION_GATE_POLICY,
    report: { metrics: overrides.metrics ?? goodMetrics() },
  };
}

describe("Calibration gates — data sufficiency", () => {
  it("returns INSUFFICIENT_DATA when authoritative samples are too few", () => {
    const r = evaluateCalibrationGates(input({ sampleCount: 3, scoredCount: 3 }));
    expect(r.decision).toBe("INSUFFICIENT_DATA");
    expect(r.reasons.join(" ")).toContain("insufficient-authoritative-data");
  });

  it("returns INSUFFICIENT_DATA when no samples are scored", () => {
    const r = evaluateCalibrationGates(input({ sampleCount: 20, scoredCount: 0 }));
    expect(r.decision).toBe("INSUFFICIENT_DATA");
  });

  it("never claims marker-equivalence for INSUFFICIENT_DATA", () => {
    const r = evaluateCalibrationGates(input({ sampleCount: 0, scoredCount: 0 }));
    expect(r.decision).toBe("INSUFFICIENT_DATA");
    expect(r.reasons.join(" ")).toContain("NO claim of marker-equivalence");
  });
});

describe("Calibration gates — PASS / FAIL", () => {
  it("PASSes when all policy thresholds are met", () => {
    const r = evaluateCalibrationGates(input());
    expect(r.decision).toBe("PASS");
    expect(r.reasons.join(" ")).toContain("NOT a claim that the AI is HKDSE marker-equivalent");
  });

  it("FAILs when MAE exceeds the policy ceiling", () => {
    const m = goodMetrics();
    m.overall.mae = 3.0;
    const r = evaluateCalibrationGates(input({ metrics: m }));
    expect(r.decision).toBe("FAIL");
    expect(r.reasons.some(s => s.includes("maxOverallMAE"))).toBe(true);
  });

  it("FAILs when exact agreement is below the policy floor", () => {
    const m = goodMetrics();
    m.overall.exactAgreementRate = 0.1;
    const r = evaluateCalibrationGates(input({ metrics: m }));
    expect(r.decision).toBe("FAIL");
    expect(r.reasons.some(s => s.includes("minExactAgreementRate"))).toBe(true);
  });

  it("FAILs when |bias| exceeds the policy ceiling", () => {
    const m = goodMetrics();
    m.overall.meanBias = -2.5;
    const r = evaluateCalibrationGates(input({ metrics: m }));
    expect(r.decision).toBe("FAIL");
  });

  it("P3-A: sufficient counts but ZERO overall-comparable pairs → INSUFFICIENT_DATA, never FAIL", () => {
    const r = evaluateCalibrationGates(input({ metrics: emptyMetrics() }));
    expect(r.decision).toBe("INSUFFICIENT_DATA");
    expect(r.reasons.join(" ")).toContain("insufficient-overall-comparable-pairs");
    expect(r.reasons.join(" ")).toContain("ASSESSMENT VALIDITY NOT ESTABLISHED");
  });

  it("TEST-CAL-012: criterion-only dataset with sufficient counts → INSUFFICIENT_DATA", () => {
    const m = emptyMetrics();
    m.perCriterion.content = { n: 10, mae: 0.5, rmse: 0.8, meanBias: 0.1, exactAgreementRate: 0.7, withinOneAgreementRate: 1, overScoringRate: 0.1, underScoringRate: 0.2 };
    const r = evaluateCalibrationGates(input({ sampleCount: 10, scoredCount: 8, metrics: m }));
    expect(r.decision).toBe("INSUFFICIENT_DATA");
  });

  it("thresholds are configurable policy", () => {
    const lenient: CalibrationGatePolicy = {
      minAuthoritativeSamples: 1,
      minScoredSamples: 1,
      maxOverallMAE: 10,
      maxOverallRMSE: 10,
      maxAbsBias: 10,
      minExactAgreementRate: 0,
      minWithinOneAgreementRate: 0,
      maxContentMAE: 10,
      maxLanguageMAE: 10,
      maxOrganizationMAE: 10,
    };
    const r = evaluateCalibrationGates(input({ policy: lenient }));
    expect(r.decision).toBe("PASS");
    expect(r.policy).toEqual(lenient);
  });

  it("TEST-CAL-009: content MAE above the dimension ceiling → FAIL", () => {
    const m = goodMetrics();
    m.perCriterion.content = { n: 10, mae: 3.0, rmse: 3.5, meanBias: 2.0, exactAgreementRate: 0.2, withinOneAgreementRate: 0.5, overScoringRate: 0.8, underScoringRate: 0.1 };
    m.perCriterion.language = { n: 10, mae: 0.5, rmse: 0.8, meanBias: 0.1, exactAgreementRate: 0.7, withinOneAgreementRate: 1, overScoringRate: 0.1, underScoringRate: 0.2 };
    m.perCriterion.organization = { n: 10, mae: 0.5, rmse: 0.8, meanBias: 0.1, exactAgreementRate: 0.7, withinOneAgreementRate: 1, overScoringRate: 0.1, underScoringRate: 0.2 };
    const r = evaluateCalibrationGates(input({ metrics: m }));
    expect(r.decision).toBe("FAIL");
    expect(r.reasons.some(s => s.includes("maxContentMAE"))).toBe(true);
  });

  it("criterion gates are not-applicable (not failing) when no criterion pairs exist", () => {
    const r = evaluateCalibrationGates(input());
    expect(r.decision).toBe("PASS");
    const na = r.thresholds.find(t => t.name === "maxContentMAE");
    expect(na?.met).toBe(true);
    expect(r.reasons.some(s => s.includes("not applicable"))).toBe(true);
  });
});
