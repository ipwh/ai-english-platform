// ============================================
// R3.10-F: Human-Marker Calibration Runner Tests
//
// Covers the design-audit required scenarios:
//   - valid human-marker fixture enters calibration
//   - level-only / synthetic fixtures are excluded
//   - overall-only and C/L/O-only scoring measured correctly
//   - missing criteria remain unavailable (never invented)
//   - conflicting evidence rejected; duplicates deterministic
//   - INSUFFICIENT_DATA / FAIL / PASS gate outcomes
//   - reproducible reports; no database/network dependency
//
// Every fixture here is a clearly-labelled synthetic TEST fixture
// (sourceOrganization "test-school"). None of it is real evidence
// and none may ever be checked into an authoritative directory.
// ============================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildHumanMarkerFixtureId,
  validateHumanMarkerEvidenceSet,
} from "../human-marker";
import { computeProvenanceHash } from "../provenance";
import { runCalibrationBenchmark } from "../runner";
import { runHumanMarkerCalibrationBenchmark } from "../runner";
import { renderCalibrationReport } from "../report";
import type { CalibrationAnalyzer } from "../runner";
import type { HumanMarkerCalibrationFixture } from "../types";

const TEST_HASH = computeProvenanceHash(["test-script-source"]);

function makeHumanFixture(
  overrides: Partial<HumanMarkerCalibrationFixture> = {},
): HumanMarkerCalibrationFixture {
  return {
    kind: "human-marker-calibration",
    id: buildHumanMarkerFixtureId({
      year: 2024,
      paper: "Paper 2",
      taskId: "P2-2024-PartB-Q2",
      sectionId: "Class 5A candidate 07",
    }),
    schemaVersion: 1,
    studentScript:
      "TEST-ONLY synthetic script: uniforms promote equality among students.",
    provenance: {
      sourceOrganization: "test-school",
      sourceDocument: "TEST-ONLY School Internal Exam 2024.pdf",
      sourceYear: 2024,
      paper: "Paper 2",
      taskId: "P2-2024-PartB-Q2",
      sectionId: "Class 5A candidate 07",
      sourcePageRange: "2-3",
      sourceHash: TEST_HASH,
      extractionMethod: "native-text",
      extractionQuality: "unknown",
      sourceAuthorityAssertion: {
        assertedBy: "repository-owner",
        authority: "HKEAA",
        acquisitionMethod: "direct-source",
        verificationRequired: true,
        // Synthetic fixtures used in gate PASS/FAIL scenarios are
        // declared VERIFIED so the Phase 8 verified-sample gate can be
        // exercised — real fixtures remain unverified until Phase 8A.
        verificationStatus: "verified",
      },
    },
    rubricVersion: "HKDSE-P2-CLO-v1",
    markerPolicy: "single marking, HKDSE P2 C/L/O rubric 0-7",
    markerId: "marker-anon-07",
    publishedLevel: "4",
    taskPartScope: "paper-2-part-b",
    scoreProvenance: {
      suppliedBy: "human-marker",
      overallScoreDirectlyScored: true,
      criterionScoresDirectlyScored: true,
      overallScoreBasis: "clo-total-0-21",
      criterionScoreBasis: "clo-0-7",
      scoringMethod: "single marking against CLO rubric",
    },
    overallScore: 15,
    contentScore: 5,
    languageScore: 5,
    organizationScore: 5,
    calibrationStatus: "ingested",
    notes: "TEST-ONLY synthetic fixture — never real evidence",
    ...overrides,
  };
}

function fixtureN(n: number, overrides: Partial<HumanMarkerCalibrationFixture> = {}): HumanMarkerCalibrationFixture {
  return makeHumanFixture({
    ...overrides,
    id: buildHumanMarkerFixtureId({
      year: 2024,
      paper: "Paper 2",
      taskId: "P2-2024-PartB-Q2",
      sectionId: `Class 5A candidate ${String(n).padStart(2, "0")}`,
    }),
    provenance: {
      ...makeHumanFixture().provenance,
      sectionId: `Class 5A candidate ${String(n).padStart(2, "0")}`,
    },
  });
}

/** Analyzer whose output exactly matches the "perfect" fixture above. */
function perfectAnalyzer(): CalibrationAnalyzer {
  return async () => ({
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
  });
}

const NOW = "2026-08-13T00:00:00.000Z";

describe("Human-marker runner — valid evidence enters calibration", () => {
  it("runs a valid fixture and produces an agreement comparison", async () => {
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [makeHumanFixture()],
      analyzer: perfectAnalyzer(),
      now: () => NOW,
    });
    expect(report.sampleCount).toBe(1);
    expect(report.scoredCount).toBe(1);
    expect(report.comparisons[0].overallError).toBe(0);
    expect(report.comparisons[0].criterion.content.error).toBe(0);
    expect(report.comparisons[0].markerPolicy).toContain("single marking");
    expect(report.generatedAt).toBe(NOW);
  });

  it("rejects HKEAA level-only fixtures (never mixed)", async () => {
    const levelOnly = {
      kind: "authoritative-calibration",
      id: "hkeaa-p2-2024-level5-exemplar1",
      schemaVersion: 1,
      provenance: {
        sourceOrganization: "hkeaa",
        sourceDocument: "Paper 2 Samples.pdf",
        sourceYear: 2024,
        paper: "Paper 2",
        taskId: "P2-2024-PartB-Q2",
        sectionId: "Level 5 exemplar 1",
        sourceFile: "x.txt",
        sourceHash: TEST_HASH,
        extractionStatus: "script-not-in-extraction",
      },
      studentScript: null,
      publishedLevel: 5,
      publishedOverallScore: null,
      publishedContentScore: null,
      publishedLanguageScore: null,
      publishedOrganizationScore: null,
      criterionScoresOfficiallyPublished: false,
      rubricVersion: "HKEAA-official-exemplar-levels",
      calibrationStatus: "ingested-level-only",
      notes: "test",
    };
    await expect(runHumanMarkerCalibrationBenchmark({
      fixtures: [levelOnly as unknown as HumanMarkerCalibrationFixture],
      analyzer: perfectAnalyzer(),
    })).rejects.toThrow(/kind must be "human-marker-calibration"/);
  });

  it("rejects synthetic fixtures (never promoted)", async () => {
    const synthetic = {
      id: "cal-01",
      task: "task",
      studentDraft: "draft",
      expected: { contentScore: null },
    };
    await expect(runHumanMarkerCalibrationBenchmark({
      fixtures: [synthetic as unknown as HumanMarkerCalibrationFixture],
      analyzer: perfectAnalyzer(),
    })).rejects.toThrow(/kind must be "human-marker-calibration"/);
  });

  it("human-marker fixtures are rejected by the HKEAA authoritative runner", async () => {
    await expect(runCalibrationBenchmark({
      fixtures: [makeHumanFixture() as never],
    })).rejects.toThrow();
  });
});

describe("Human-marker runner — missing-score semantics", () => {
  it("measures overall-only scoring correctly and never invents C/L/O", async () => {
    const overallOnly = makeHumanFixture({
      contentScore: null,
      languageScore: null,
      organizationScore: null,
      scoreProvenance: {
        ...makeHumanFixture().scoreProvenance,
        criterionScoreBasis: null,
      },
    });
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [overallOnly],
      analyzer: perfectAnalyzer(),
    });
    expect(report.comparisons[0].overallError).toBe(0);
    expect(report.metrics.overall.n).toBe(1);
    expect(report.metrics.perCriterion.content.n).toBe(0);
    expect(report.metrics.perCriterion.language.n).toBe(0);
    expect(report.metrics.perCriterion.organization.n).toBe(0);
  });

  it("measures C/L/O-only scoring correctly; overall remains unavailable", async () => {
    const cloOnly = makeHumanFixture({
      overallScore: null,
      scoreProvenance: {
        ...makeHumanFixture().scoreProvenance,
        overallScoreBasis: null,
      },
    });
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [cloOnly],
      analyzer: perfectAnalyzer(),
    });
    expect(report.comparisons[0].overallError).toBeNull();
    expect(report.metrics.overall.n).toBe(0);
    expect(report.metrics.perCriterion.content.n).toBe(1);
    expect(report.metrics.perCriterion.language.n).toBe(1);
    expect(report.metrics.perCriterion.organization.n).toBe(1);
  });

  it("maps overall score through the declared scale (clo-total vs percentage)", async () => {
    const percentage = makeHumanFixture({
      overallScore: 68,
      scoreProvenance: {
        ...makeHumanFixture().scoreProvenance,
        overallScoreBasis: "percentage-0-100",
      },
    });
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [percentage],
      analyzer: perfectAnalyzer(),
    });
    // percentage basis compares against analysis.overallScore (68)
    expect(report.comparisons[0].overallError).toBe(0);
  });

  it("reports missing criteria as unavailable in the report", () => {
    const overallOnly = makeHumanFixture({
      contentScore: null,
      languageScore: null,
      organizationScore: null,
      scoreProvenance: {
        ...makeHumanFixture().scoreProvenance,
        criterionScoreBasis: null,
      },
    });
    return runHumanMarkerCalibrationBenchmark({
      fixtures: [overallOnly],
      analyzer: perfectAnalyzer(),
      now: () => NOW,
    }).then(report => {
      const md = renderCalibrationReport(report, undefined, {
        datasetDescription: "agreement with human-marker scored samples",
        criterionUnavailableMessage:
          "No criterion-level scores were supplied by markers for these samples.",
      });
      expect(md).toContain("agreement with human-marker scored samples");
      expect(md).toContain(
        "No criterion-level scores were supplied by markers for these samples.",
      );
    });
  });
});

describe("Human-marker runner — evidence-set handling", () => {
  it("rejects conflicting evidence before any analysis", async () => {
    const a = makeHumanFixture({ overallScore: 15 });
    const b = makeHumanFixture({ overallScore: 11 });
    expect(validateHumanMarkerEvidenceSet([a, b]).ok).toBe(false);
    await expect(runHumanMarkerCalibrationBenchmark({
      fixtures: [a, b],
      analyzer: perfectAnalyzer(),
    })).rejects.toThrow(/conflicting/i);
  });

  it("deduplicates identical evidence deterministically", async () => {
    const a = makeHumanFixture();
    const b = makeHumanFixture();
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [a, b],
      analyzer: perfectAnalyzer(),
    });
    expect(report.sampleCount).toBe(1);
    expect(report.scoredCount).toBe(1);
    expect(
      report.insufficientAreas.some(area => area.area === "duplicate-evidence-deduped"),
    ).toBe(true);
  });
});

describe("Human-marker runner — gate outcomes", () => {
  it("INSUFFICIENT_DATA when the scored sample count is too small", async () => {
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [fixtureN(1), fixtureN(2), fixtureN(3)],
      analyzer: perfectAnalyzer(),
    });
    expect(report.gate.decision).toBe("INSUFFICIENT_DATA");
    expect(report.gate.reasons.join(" ")).toContain("insufficient-authoritative-data");
  });

  it("FAIL when agreement breaks a policy threshold", async () => {
    const badAnalyzer: CalibrationAnalyzer = async () => ({
      overallScore: 68,
      contentScore: 5,
      languageScore: 5,
      organizationScore: 5,
      cloTotalScore: 18, // +3 vs marker total 15 → MAE 3 > 1.5
      dseLevel: "4",
      platformWritingEstimate: "4",
      strengths: [],
      weaknesses: [],
      grammarErrors: [],
      chinglishWarnings: [],
      vocabularySuggestions: [],
      structureFeedback: "x",
      generalComment: "x",
    });
    const fixtures = Array.from({ length: 10 }, (_, i) => fixtureN(i + 1));
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures,
      analyzer: badAnalyzer,
    });
    expect(report.gate.decision).toBe("FAIL");
    expect(report.gate.reasons.some(r => r.includes("maxOverallMAE"))).toBe(true);
  });

  it("PASS when all policy thresholds are satisfied", async () => {
    const fixtures = Array.from({ length: 10 }, (_, i) => fixtureN(i + 1));
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures,
      analyzer: perfectAnalyzer(),
    });
    expect(report.gate.decision).toBe("PASS");
    expect(report.metrics.overall.mae).toBe(0);
    expect(report.metrics.overall.exactAgreementRate).toBe(1);
    // PASS is a policy result, never a marker-equivalence claim
    expect(report.gate.reasons.join(" ")).toContain("NOT a claim");
  });

  it("reports per-marker-policy agreement", async () => {
    const fixtures = Array.from({ length: 10 }, (_, i) =>
      fixtureN(i + 1, { markerPolicy: "single marking" }));
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures,
      analyzer: perfectAnalyzer(),
    });
    const policy = report.metrics.perMarkerPolicy.find(
      g => g.group === "single marking",
    );
    expect(policy).toBeDefined();
    expect(policy?.n).toBe(10);
  });
});

describe("Human-marker runner — reproducibility & independence", () => {
  it("produces byte-identical reports for identical evidence + analyzer + now", async () => {
    const fixtures = Array.from({ length: 10 }, (_, i) => fixtureN(i + 1));
    const opts = { fixtures, analyzer: perfectAnalyzer(), now: () => NOW } as const;
    const a = await runHumanMarkerCalibrationBenchmark({ ...opts });
    const b = await runHumanMarkerCalibrationBenchmark({ ...opts });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(renderCalibrationReport(a)).toBe(renderCalibrationReport(b));
  });

  it("the runner module has no database or network dependency", () => {
    const source = readFileSync(join(__dirname, "..", "runner.ts"), "utf-8");
    expect(source).not.toMatch(/from\s+["']@\/shared\/db/);
    expect(source).not.toMatch(/prisma|@prisma/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
