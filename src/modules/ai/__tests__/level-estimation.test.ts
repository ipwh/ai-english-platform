// ============================================
// Cross-paper level estimation policy tests
// Locks the 0-100 → 1-5 thresholds that make Paper 3 Integrated Skills
// agree with Paper 2 Writing at the displayed-percentage level.
// ============================================

import { describe, expect, it } from "vitest";
import { estimateLevelFromScore100 } from "../core/level-estimation";
import { estimateDSELevelFromCLO, cloTotalToOverall100 } from "../core/writing-score-policy";

describe("estimateLevelFromScore100", () => {
  it("maps percentages using the Paper 2 CLO threshold equivalents", () => {
    expect(estimateLevelFromScore100(100)).toBe("5");
    expect(estimateLevelFromScore100(76)).toBe("5");
    expect(estimateLevelFromScore100(75)).toBe("4");
    expect(estimateLevelFromScore100(62)).toBe("4");
    expect(estimateLevelFromScore100(61)).toBe("3");
    expect(estimateLevelFromScore100(48)).toBe("3");
    expect(estimateLevelFromScore100(47)).toBe("2");
    expect(estimateLevelFromScore100(33)).toBe("2");
    expect(estimateLevelFromScore100(32)).toBe("1");
    expect(estimateLevelFromScore100(0)).toBe("1");
  });

  it("is fail-safe for non-finite input (never a NaN/Infinity level)", () => {
    expect(estimateLevelFromScore100(NaN)).toBe("1");
    expect(estimateLevelFromScore100(Infinity)).toBe("1");
    expect(estimateLevelFromScore100(-Infinity)).toBe("1");
  });

  it("thresholds equal the displayed percentage of the Paper 2 CLO thresholds", () => {
    // 16/13/10/7 of 21 round to 76/62/48/33 — the same boundaries the
    // percentage mapping uses, so both papers agree at every threshold.
    for (const clo of [16, 13, 10, 7, 0]) {
      const pct = cloTotalToOverall100(clo);
      expect(estimateLevelFromScore100(pct)).toBe(estimateDSELevelFromCLO(clo));
    }
  });
});
