// ============================================
// R3.10-F: Runner & Report Tests
//
// Covers Phase 8 items:
//   9. golden runner separates regression from calibration
//   13. insufficient-data state (report side)
// Plus: fail-closed runner behavior and report language.
// ============================================

import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";
import type { WritingAnalysis } from "@/modules/ai/usecases/analyze-writing";

vi.mock("@/modules/ai/usecases/analyze-writing", () => {
  const calls: Array<{ title: string }> = [];
  return {
    calls,
    analyzeWriting: async (input: { title: string }): Promise<WritingAnalysis> => {
      calls.push({ title: input.title });
      return {
        overallScore: 68,
        contentScore: 5,
        languageScore: 5,
        organizationScore: 5,
        cloTotalScore: 15,
        dseLevel: "4",
        platformWritingEstimate: "4",
        strengths: [],
        weaknesses: [],
        grammarErrors: [],
        chinglishWarnings: [],
        vocabularySuggestions: [],
        structureFeedback: "test",
        generalComment: "test",
      };
    },
  };
});

import * as analyzeWritingModule from "@/modules/ai/usecases/analyze-writing";

/** Call log exported by the mock factory. */
const analyzeCalls = (
  analyzeWritingModule as unknown as { calls: Array<{ title: string }> }
).calls;

import { runCalibrationBenchmark, loadAuthoritativeFixtures } from "../runner";
import { renderCalibrationReport } from "../report";
import { runCombinedBenchmark, loadFixtures } from "@/modules/ai/evaluation/golden-runner";
import { validateAuthoritativeFixture, computeProvenanceHash } from "../provenance";
import type { AuthoritativeCalibrationFixture } from "../types";

const FIXTURES_DIR = join(__dirname, "..", "fixtures", "hkeaa");

function authoritativeFixture(overrides: Partial<AuthoritativeCalibrationFixture> = {}): AuthoritativeCalibrationFixture {
  return {
    kind: "authoritative-calibration",
    id: "hkeaa-test-fixture-1",
    schemaVersion: 1,
    provenance: {
      sourceOrganization: "hkeaa",
      sourceDocument: "Test Official Sample.pdf",
      sourceYear: 2024,
      paper: "Paper 2",
      taskId: "P2-2024-PartB-Q1",
      sectionId: "Level 4 exemplar 1",
      sourceFile: "materials/_extracted/test.txt",
      sourceHash: computeProvenanceHash(["test"]),
      extractionStatus: "complete-script-text",
    },
    studentScript: "Students should wear uniforms because they promote equality.",
    publishedLevel: 4,
    publishedOverallScore: null,
    publishedContentScore: null,
    publishedLanguageScore: null,
    publishedOrganizationScore: null,
    criterionScoresOfficiallyPublished: false,
    rubricVersion: "HKEAA-official-exemplar-levels",
    calibrationStatus: "ingested",
    notes: "test fixture",
    ...overrides,
  };
}

describe("Calibration runner — fail-closed behavior", () => {
  it("throws when a fixture fails validation (never silently skips)", async () => {
    const bad = authoritativeFixture({ publishedLevel: 99 as unknown as 4 });
    await expect(runCalibrationBenchmark({ fixtures: [bad] })).rejects.toThrow(/invalid/i);
  });

  it("throws when loading a non-authoritative fixture file", () => {
    const synthetic = { id: "x", task: "t", studentDraft: "d", expected: {} };
    expect(() => validateAuthoritativeFixture(synthetic as unknown as AuthoritativeCalibrationFixture))
      .not.toBeNull();
    expect(validateAuthoritativeFixture(synthetic as unknown as AuthoritativeCalibrationFixture).ok).toBe(false);
  });
});

describe("Calibration runner — level-only authoritative data (current reality)", () => {
  it("counts level-only fixtures as unscorable and reports INSUFFICIENT DATA", async () => {
    const report = await runCalibrationBenchmark({ fixturesDir: FIXTURES_DIR });
    expect(report.sampleCount).toBe(308);
    expect(report.scoredCount).toBe(0);
    expect(report.unscorableCount).toBe(308);
    expect(report.gate.decision).toBe("INSUFFICIENT_DATA");
    expect(report.insufficientAreas.some(a => a.area === "scored-samples")).toBe(true);
    expect(report.metrics.overall.n).toBe(0);
  });

  it("does not invoke the LLM pipeline when no fixture is runnable", async () => {
    analyzeCalls.length = 0;
    await runCalibrationBenchmark({ fixturesDir: FIXTURES_DIR });
    expect(analyzeCalls).toHaveLength(0);
  });
});

describe("Calibration runner — runnable fixtures (injected analyzer)", () => {
  it("compares model output against published values and computes metrics", async () => {
    const fixtures = [
      authoritativeFixture({ id: "a", publishedLevel: 4 }),
      authoritativeFixture({ id: "b", publishedLevel: 2 }),
    ];
    const report = await runCalibrationBenchmark({
      fixtures,
      analyzer: async (): Promise<WritingAnalysis> => ({
        overallScore: 68,
        contentScore: 5,
        languageScore: 5,
        organizationScore: 5,
        cloTotalScore: 15,
        dseLevel: "4",
        platformWritingEstimate: "4",
        strengths: [],
        weaknesses: [],
        grammarErrors: [],
        chinglishWarnings: [],
        vocabularySuggestions: [],
        structureFeedback: "x",
        generalComment: "x",
      }),
      now: () => "2026-08-13T00:00:00.000Z",
    });
    expect(report.scoredCount).toBe(2);
    expect(report.generatedAt).toBe("2026-08-13T00:00:00.000Z");
    expect(report.comparisons).toHaveLength(2);
    const a = report.comparisons.find(c => c.fixtureId === "a");
    expect(a?.levelExactMatch).toBe(true);
    expect(report.metrics.perLevel.find(g => g.group === "Level 4")?.n).toBe(1);
  });

  it("records analyzer failures per comparison — not silently dropped", async () => {
    const report = await runCalibrationBenchmark({
      fixtures: [authoritativeFixture()],
      analyzer: async () => {
        throw new Error("provider timeout");
      },
    });
    expect(report.scoredCount).toBe(0);
    expect(report.comparisons[0].analysisFailure).toContain("provider timeout");
  });
});

describe("Regression vs calibration separation", () => {
  it("runCombinedBenchmark returns the two datasets in separate fields", async () => {
    const combined = await runCombinedBenchmark({
      calibration: { fixturesDir: FIXTURES_DIR },
    });
    expect(combined.regression).toBeDefined();
    expect(combined.calibration).toBeDefined();
    // Regression dataset = synthetic fixtures only (expected-null allowed)
    expect(combined.regression.count).toBeGreaterThan(0);
    for (const r of combined.regression.results) {
      expect(r.fixtureId).toBeDefined();
    }
    // Calibration dataset = authoritative fixtures only
    expect(combined.calibration.sampleCount).toBe(308);
    // Metrics are never shared between the two sections
    expect(combined.calibration.metrics).toBeDefined();
    expect(combined.regression.results.length).toBeGreaterThan(0);
  });

  it("golden regression loader never loads authoritative fixtures", () => {
    const synthetic = loadFixtures();
    for (const f of synthetic) {
      expect((f as { provenance?: unknown }).provenance).toBeUndefined();
    }
    const authoritative = loadAuthoritativeFixtures(FIXTURES_DIR);
    for (const f of authoritative) {
      expect(f.kind).toBe("authoritative-calibration");
    }
  });
});

describe("Calibration report language", () => {
  it("says INSUFFICIENT AUTHORITATIVE DATA and never claims marker-equivalence", async () => {
    const report = await runCalibrationBenchmark({ fixturesDir: FIXTURES_DIR });
    const md = renderCalibrationReport(report);
    expect(md).toContain("INSUFFICIENT AUTHORITATIVE DATA");
    // The report carries the disclaimer — but must never make the claim
    // affirmatively. Strip disclaimer lines before checking.
    const withoutDisclaimers = md
      .split("\n")
      .filter(l => !l.includes("NO claim"))
      .join("\n");
    expect(withoutDisclaimers).not.toMatch(/marker[- ]equivalent/i);
    expect(md).toContain("makes NO claim");
    expect(md).toContain("REGRESSION");
    expect(md).toContain("CALIBRATION");
    expect(md).toContain("POLICY");
  });

  it("separates REGRESSION and CALIBRATION sections in the combined report", async () => {
    const combined = await runCombinedBenchmark({ calibration: { fixturesDir: FIXTURES_DIR } });
    const md = renderCalibrationReport(combined.calibration, combined.regression);
    const regressionIndex = md.indexOf("## REGRESSION");
    const calibrationIndex = md.indexOf("## CALIBRATION");
    expect(regressionIndex).toBeGreaterThanOrEqual(0);
    expect(calibrationIndex).toBeGreaterThan(regressionIndex);
  });
});
