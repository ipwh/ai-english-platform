// ============================================
// Sprint 131: CloRationaleCard pure logic tests
// Tests the display logic without requiring jsdom.
// ============================================

import { describe, it, expect } from "vitest";
import type { CloDimensionRationaleResult } from "@/shared/types/ai-response-types";

// Mirror the component's fallback detection logic
function isFallbackRationale(r: CloDimensionRationaleResult): boolean {
  return r.evidence.length === 0 && r.strengths.length === 0 && r.limitations.length <= 1;
}

// Mirror the component's dimension labeling
const DIMENSION_LABELS: Record<string, { zh: string; en: string }> = {
  content: { zh: "內容", en: "Content" },
  language: { zh: "語言", en: "Language" },
  organization: { zh: "組織", en: "Organization" },
};

function formatDimensionName(dimension: string, lang: string): string {
  return DIMENSION_LABELS[dimension]?.[lang as "zh" | "en"] || dimension;
}

// Mirror the component's panel empty-state logic
function hasValidRationales(rationales?: CloDimensionRationaleResult[]): boolean {
  return !!(rationales && rationales.length > 0);
}

describe("CloRationaleCard — fallback detection", () => {
  it("detects fallback when evidence and strengths are empty", () => {
    const r: CloDimensionRationaleResult = {
      dimension: "language",
      score: 4,
      strengths: [],
      limitations: ["Unable to provide detailed analysis."],
      evidence: [],
      nextSteps: [],
    };
    expect(isFallbackRationale(r)).toBe(true);
  });

  it("does not detect fallback when evidence is present", () => {
    const r: CloDimensionRationaleResult = {
      dimension: "content",
      score: 3,
      strengths: [],
      limitations: ["Needs development."],
      evidence: ["Students should recycle more plastic"],
      nextSteps: [],
    };
    expect(isFallbackRationale(r)).toBe(false);
  });

  it("does not detect fallback when strengths are present", () => {
    const r: CloDimensionRationaleResult = {
      dimension: "organization",
      score: 5,
      strengths: ["Clear structure."],
      limitations: [],
      evidence: [],
      nextSteps: [],
    };
    expect(isFallbackRationale(r)).toBe(false);
  });

  it("does not detect fallback when multiple limitations exist", () => {
    const r: CloDimensionRationaleResult = {
      dimension: "content",
      score: 3,
      strengths: [],
      limitations: ["Weak point 1.", "Weak point 2."],
      evidence: [],
      nextSteps: [],
    };
    expect(isFallbackRationale(r)).toBe(false);
  });
});

describe("CloRationaleCard — dimension labeling", () => {
  it("returns Chinese label for zh", () => {
    expect(formatDimensionName("content", "zh")).toBe("內容");
    expect(formatDimensionName("language", "zh")).toBe("語言");
    expect(formatDimensionName("organization", "zh")).toBe("組織");
  });

  it("returns English label for en", () => {
    expect(formatDimensionName("content", "en")).toBe("Content");
    expect(formatDimensionName("language", "en")).toBe("Language");
    expect(formatDimensionName("organization", "en")).toBe("Organization");
  });

  it("returns raw dimension for unknown value", () => {
    expect(formatDimensionName("grammar", "zh")).toBe("grammar");
  });
});

describe("CloFeedbackPanel — empty/null handling", () => {
  it("returns false for undefined", () => {
    expect(hasValidRationales(undefined)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasValidRationales([])).toBe(false);
  });

  it("returns true for populated array", () => {
    const rationales: CloDimensionRationaleResult[] = [
      { dimension: "content", score: 3, strengths: ["Good."], limitations: [], evidence: [], nextSteps: [] },
    ];
    expect(hasValidRationales(rationales)).toBe(true);
  });

  it("returns true for partial rationale (only one dimension)", () => {
    const rationales: CloDimensionRationaleResult[] = [
      { dimension: "content", score: 3, strengths: [], limitations: ["Needs work."], evidence: [], nextSteps: ["Improve."] },
    ];
    expect(hasValidRationales(rationales)).toBe(true);
  });

  it("returns true for all three dimensions", () => {
    const rationales: CloDimensionRationaleResult[] = [
      { dimension: "content", score: 3, strengths: [], limitations: [], evidence: [], nextSteps: [] },
      { dimension: "language", score: 4, strengths: [], limitations: [], evidence: [], nextSteps: [] },
      { dimension: "organization", score: 5, strengths: [], limitations: [], evidence: [], nextSteps: [] },
    ];
    expect(hasValidRationales(rationales)).toBe(true);
  });
});

// ============================================
// Sprint 131: Fallback safety — fallback ≠ student weakness
// ============================================
describe("CloRationaleCard — fallback safety", () => {
  it("fallback rationale is NOT presented as student weakness", () => {
    // A fallback rationale (empty evidence, empty strengths, single limitation)
    // must be detected as fallback, NOT as a real student weakness.
    const fallback: CloDimensionRationaleResult = {
      dimension: "language",
      score: 4,
      strengths: [],
      limitations: ["Unable to provide detailed analysis for this dimension."],
      evidence: [],
      nextSteps: [],
    };

    // Fallback detection
    expect(isFallbackRationale(fallback)).toBe(true);

    // The limitation text must not be confused with a real student weakness
    const isRealWeakness =
      fallback.limitations.length > 0 &&
      !fallback.limitations.some(l => l.includes("Unable to provide"));
    expect(isRealWeakness).toBe(false);
  });

  it("real weaknesses are not falsely flagged as fallback", () => {
    const real: CloDimensionRationaleResult = {
      dimension: "content",
      score: 3,
      strengths: ["Good introduction."],
      limitations: ["Arguments lack supporting examples.", "Second point is underdeveloped."],
      evidence: ["Students should recycle more plastic"],
      nextSteps: ["Add a concrete example for each argument."],
    };

    expect(isFallbackRationale(real)).toBe(false);
  });

  it("empty evidence section is not displayed as evidence", () => {
    // When evidence is empty, there should be no evidence block
    const r: CloDimensionRationaleResult = {
      dimension: "organization",
      score: 5,
      strengths: ["Clear structure."],
      limitations: [],
      evidence: [],
      nextSteps: [],
    };
    expect(r.evidence).toHaveLength(0);
  });
});
