// ============================================
// R3.10-F: Calibration Metrics Tests
//
// Covers Phase 8 items:
//   10. MAE/RMSE/bias calculations
//   11. exact / ±1 agreement
//   12. per-level reporting
//   (per-year / per-task groupings verified too)
// ============================================

import { describe, it, expect } from "vitest";
import {
  computeAgreementMetrics,
  computeCalibrationMetrics,
  mean,
  rmse,
} from "../metrics";
import type { CalibrationComparison } from "../types";

function comparison(
  overrides: Partial<CalibrationComparison> = {},
): CalibrationComparison {
  return {
    fixtureId: "f",
    year: 2024,
    taskId: "P2-2024-PartB-Q2",
    paper: "Paper 2",
    publishedLevel: "3",
    predictedLevel: "3",
    levelExactMatch: true,
    publishedOverall: 21,
    predictedOverall: 20,
    overallError: -1,
    criterion: {
      content: { published: null, predicted: null, error: null },
      language: { published: null, predicted: null, error: null },
      organization: { published: null, predicted: null, error: null },
    },
    analysisFailure: null,
    verificationStatus: null,
    ...overrides,
  };
}

describe("Calibration metrics — shared helpers", () => {
  it("mean returns null for empty input", () => {
    expect(mean([])).toBeNull();
  });

  it("mean computes arithmetic mean", () => {
    expect(mean([2, 4, 6])).toBe(4);
  });

  it("rmse returns null for empty input", () => {
    expect(rmse([])).toBeNull();
  });

  it("rmse computes root mean square", () => {
    // errors [3, 4] → sqrt((9+16)/2) = sqrt(12.5)
    expect(rmse([3, 4])).toBeCloseTo(3.5355, 3);
  });
});

describe("Calibration metrics — agreement statistics", () => {
  it("computes MAE / RMSE / bias exactly", () => {
    // errors: [1, -1, 2] → MAE=4/3, RMSE=sqrt(6/3)=sqrt2, bias=2/3
    const m = computeAgreementMetrics([1, -1, 2]);
    expect(m.n).toBe(3);
    expect(m.mae).toBeCloseTo(4 / 3, 4);
    expect(m.rmse).toBeCloseTo(Math.SQRT2, 4);
    expect(m.meanBias).toBeCloseTo(2 / 3, 4);
  });

  it("computes exact agreement rate", () => {
    const m = computeAgreementMetrics([0, 0, 1, -1]);
    expect(m.exactAgreementRate).toBeCloseTo(0.5, 4);
  });

  it("computes ±1 agreement rate", () => {
    const m = computeAgreementMetrics([0, 1, -1, 3]);
    expect(m.withinOneAgreementRate).toBeCloseTo(0.75, 4);
  });

  it("computes over/under scoring rates", () => {
    const m = computeAgreementMetrics([1, 2, 0, -1]);
    expect(m.overScoringRate).toBeCloseTo(0.5, 4);
    expect(m.underScoringRate).toBeCloseTo(0.25, 4);
  });

  it("returns all-null metrics for zero comparable pairs", () => {
    const m = computeAgreementMetrics([]);
    expect(m.n).toBe(0);
    expect(m.mae).toBeNull();
    expect(m.rmse).toBeNull();
    expect(m.exactAgreementRate).toBeNull();
  });
});

describe("Calibration metrics — per-level / per-year / per-task", () => {
  const comparisons = [
    comparison({ fixtureId: "a", year: 2024, taskId: "T1", publishedLevel: "5", overallError: 0 }),
    comparison({ fixtureId: "b", year: 2024, taskId: "T1", publishedLevel: "5", overallError: 2 }),
    comparison({ fixtureId: "c", year: 2025, taskId: "T2", publishedLevel: "3", overallError: -1 }),
  ];

  it("groups per-level with counts and MAE", () => {
    const m = computeCalibrationMetrics(comparisons);
    const l5 = m.perLevel.find(g => g.group === "Level 5");
    const l3 = m.perLevel.find(g => g.group === "Level 3");
    expect(l5).toBeDefined();
    expect(l5?.n).toBe(2);
    expect(l5?.exact).toBeCloseTo(0.5, 4);
    expect(l3?.n).toBe(1);
  });

  it("groups per-year deterministically (sorted)", () => {
    const m = computeCalibrationMetrics(comparisons);
    expect(m.perYear.map(g => g.group)).toEqual(["2024", "2025"]);
    expect(m.perYear[0].n).toBe(2);
  });

  it("groups per-task deterministically", () => {
    const m = computeCalibrationMetrics(comparisons);
    expect(m.perTask.map(g => g.group)).toEqual(["T1", "T2"]);
  });

  it("criterion metrics stay at n=0 when no official criterion scores exist", () => {
    const m = computeCalibrationMetrics(comparisons);
    expect(m.perCriterion.content.n).toBe(0);
    expect(m.perCriterion.language.mae).toBeNull();
    expect(m.perCriterion.organization.n).toBe(0);
  });

  it("criterion metrics compute only where official criterion scores exist", () => {
    const withCriterion = comparison({
      criterion: {
        content: { published: 6, predicted: 5, error: -1 },
        language: { published: 7, predicted: 7, error: 0 },
        organization: { published: null, predicted: null, error: null },
      },
    });
    const m = computeCalibrationMetrics([withCriterion]);
    expect(m.perCriterion.content.n).toBe(1);
    expect(m.perCriterion.content.mae).toBe(1);
    expect(m.perCriterion.language.exactAgreementRate).toBe(1);
    expect(m.perCriterion.organization.n).toBe(0);
  });
});
