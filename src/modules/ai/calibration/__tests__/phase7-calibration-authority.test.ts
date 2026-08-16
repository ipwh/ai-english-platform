// ============================================
// R3.10-K Phase 7 — Calibration Authority & Evidence Integrity Tests
//
// TEST-CAL-001..015 (minus 003/004 canonical-boundary tests and 013
// RAG-exclusion test, which live beside the modules they guard).
//
// Every fixture here is a clearly-labelled synthetic TEST fixture —
// none of it is real evidence and none may ever be checked into an
// authoritative directory.
// ============================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildHumanMarkerFixtureId,
  runHumanMarkerCalibrationBenchmark,
  runCalibrationBenchmark,
  renderCalibrationReport,
  evaluateCalibrationGates,
  computeLevelAgreementMetrics,
  parseOrdinalLevelIndex,
  checkHumanMarkerEvidenceIntake,
  CALIBRATION_VERSION,
  CALIBRATION_DATASET_VERSION,
  DEFAULT_CALIBRATION_GATE_POLICY,
} from "../index";
import { computeProvenanceHash } from "../provenance";
import { SCORING_VERSION } from "@/modules/ai/core/writing-score-policy";
import type {
  AuthoritativeCalibrationFixture,
  CalibrationComparison,
  HumanMarkerCalibrationFixture,
} from "../types";

const TEST_HASH = computeProvenanceHash(["phase7-test-source"]);

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
    studentScript: "TEST-ONLY synthetic script: recycling reduces plastic waste.",
    provenance: {
      sourceOrganization: "test-school",
      sourceDocument: "TEST-ONLY School Internal Exam 2024.pdf",
      sourceYear: 2024,
      paper: "Paper 2",
      taskId: "P2-2024-PartB-Q2",
      sectionId: "Class 5A candidate 07",
      sourceHash: TEST_HASH,
      extractionMethod: "native-text",
      extractionQuality: "unknown",
      sourceAuthorityAssertion: {
        assertedBy: "repository-owner",
        authority: "HKEAA",
        acquisitionMethod: "direct-source",
        verificationRequired: false,
      },
    },
    rubricVersion: "HKDSE-P2-CLO-v1",
    markerPolicy: "single marking, HKDSE P2 C/L/O rubric 0-7",
    markerId: "marker-anon-07",
    publishedLevel: "4",
    scoreProvenance: {
      suppliedBy: "human-marker",
      overallScoreDirectlyScored: true,
      criterionScoresDirectlyScored: false,
      overallScoreBasis: "percentage-0-100",
      criterionScoreBasis: null,
      scoringMethod: "single marking, percentage score",
    },
    overallScore: 60,
    contentScore: null,
    languageScore: null,
    organizationScore: null,
    calibrationStatus: "ingested",
    notes: "TEST-ONLY synthetic fixture — never real evidence",
    ...overrides,
  };
}

function makeAuthoritativeFixture(): AuthoritativeCalibrationFixture {
  return {
    kind: "authoritative-calibration",
    id: "hkeaa-phase7-test-1",
    schemaVersion: 1,
    provenance: {
      sourceOrganization: "hkeaa",
      sourceDocument: "Test Official Sample.pdf",
      sourceYear: 2024,
      paper: "Paper 2",
      taskId: "P2-2024-PartB-Q1",
      sectionId: "Level 4 exemplar 1",
      sourceFile: "materials/_extracted/test.txt",
      sourceHash: computeProvenanceHash(["phase7-hkeaa-test"]),
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
    notes: "TEST-ONLY synthetic authoritative fixture",
  };
}

const fixedAnalyzer = (overall: number) => async () => ({
  overallScore: overall,
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
});

// ============================================
// TEST-CAL-001 / TEST-CAL-002 — mutations must move the metrics
// ============================================
describe("TEST-CAL-001/002 — human score and AI score are real signal", () => {
  it("TEST-CAL-001: humanScore +1 changes calibration metrics", async () => {
    const a = await runHumanMarkerCalibrationBenchmark({
      fixtures: [makeHumanFixture({ overallScore: 60 })],
      analyzer: fixedAnalyzer(70),
    });
    const b = await runHumanMarkerCalibrationBenchmark({
      fixtures: [makeHumanFixture({ overallScore: 61 })],
      analyzer: fixedAnalyzer(70),
    });
    expect(a.metrics.overall.mae).toBe(10);
    expect(b.metrics.overall.mae).toBe(9);
    expect(a.metrics.overall.mae).not.toBe(b.metrics.overall.mae);
  });

  it("TEST-CAL-002: AI score +1 changes calibration metrics", async () => {
    const a = await runHumanMarkerCalibrationBenchmark({
      fixtures: [makeHumanFixture({ overallScore: 60 })],
      analyzer: fixedAnalyzer(71),
    });
    const b = await runHumanMarkerCalibrationBenchmark({
      fixtures: [makeHumanFixture({ overallScore: 60 })],
      analyzer: fixedAnalyzer(72),
    });
    expect(a.metrics.overall.mae).toBe(11);
    expect(b.metrics.overall.mae).toBe(12);
    expect(a.metrics.overall.mae).not.toBe(b.metrics.overall.mae);
  });
});

// ============================================
// TEST-CAL-005 / TEST-CAL-014 — fixture immutability
// ============================================
describe("TEST-CAL-005/014 — no production path can write calibration fixtures", () => {
  const PROJECT_ROOT = resolve(__dirname, "..", "..", "..", "..", "..");
  const FORBIDDEN_DIRS = ["fixtures/human-marker", "fixtures/hkeaa"];

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(p, out);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        out.push(p);
      }
    }
    return out;
  }

  function fixturePathAppears(content: string): boolean {
    return FORBIDDEN_DIRS.some(d => content.includes(d));
  }

  it("TEST-CAL-005: no production source (outside calibration module) writes fixture dirs", () => {
    const violations: string[] = [];
    for (const file of walk(join(PROJECT_ROOT, "src"))) {
      if (file.includes("__tests__")) continue;
      if (file.includes(join("modules", "ai", "calibration"))) continue; // ingestion is dev-tooling with immutability contract
      const content = readFileSync(file, "utf-8");
      const writes = /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\s*\(/.test(content);
      if (writes && fixturePathAppears(content)) {
        violations.push(file);
      }
    }
    expect(violations, `production files writing calibration fixtures:\n${violations.join("\n")}`)
      .toEqual([]);
  });

  it("TEST-CAL-014: no API route reads or writes the human-marker fixture directory", () => {
    const apiDir = join(PROJECT_ROOT, "src", "app", "api");
    if (!existsSync(apiDir)) return; // defensive — routes covered by authority tests
    const violations: string[] = [];
    for (const file of walk(apiDir)) {
      const content = readFileSync(file, "utf-8");
      if (content.includes("fixtures/human-marker") || content.includes("fixtures/hkeaa")) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });
});

// ============================================
// TEST-CAL-006 / TEST-CAL-007 — zero data & false-claim guard
// ============================================
describe("TEST-CAL-006/007 — zero data is INSUFFICIENT_DATA, never a claim", () => {
  it("TEST-CAL-006: empty dataset → INSUFFICIENT_DATA", async () => {
    const report = await runHumanMarkerCalibrationBenchmark({ fixtures: [] });
    expect(report.gate.decision).toBe("INSUFFICIENT_DATA");
    expect(report.insufficientAreas.some(a => a.area === "human-marker-samples")).toBe(true);
    expect(report.metrics.overall.n).toBe(0);
  });

  it("TEST-CAL-007: INSUFFICIENT_DATA report makes no validity claim", async () => {
    const report = await runHumanMarkerCalibrationBenchmark({ fixtures: [] });
    const rendered = renderCalibrationReport(report, undefined, {
      datasetDescription: "agreement with human-marker scored samples",
    });
    expect(rendered).toMatch(/Decision: \*\*INSUFFICIENT_DATA\*\*/);
    expect(rendered).not.toMatch(/\bvalidated\b/i);
    expect(rendered).not.toMatch(/\bcalibrated\b/i);
    expect(rendered).not.toMatch(/officially accurate/i);
    // The ONLY marker-equivalence sentence must be the negation.
    expect(rendered).toContain("makes NO claim that the AI is HKDSE marker-equivalent");
    const positiveClaimLines = rendered
      .split("\n")
      .filter(l => /marker-equivalent/i.test(l) && !l.includes("NO claim"));
    expect(positiveClaimLines).toEqual([]);
  });
});

// ============================================
// TEST-CAL-008 — failures are never silently dropped
// ============================================
describe("TEST-CAL-008 — analysis failures appear in the report", () => {
  it("renders fixture id + failure reason", async () => {
    const failingAnalyzer = async (): Promise<never> => {
      throw new Error("PROVIDER_UNAVAILABLE");
    };
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [makeHumanFixture()],
      analyzer: failingAnalyzer,
    });
    const comparison = report.comparisons[0];
    expect(comparison.analysisFailure).toBe("PROVIDER_UNAVAILABLE");
    const rendered = renderCalibrationReport(report, undefined, {
      datasetDescription: "agreement with human-marker scored samples",
    });
    expect(rendered).toContain(comparison.fixtureId);
    expect(rendered).toContain("PROVIDER_UNAVAILABLE");
    expect(rendered).toContain("Fixture results (failures never silently dropped)");
  });
});

// ============================================
// TEST-CAL-009 / TEST-CAL-012 — gate semantics
// ============================================
describe("TEST-CAL-009/012 — dimension gates & criterion-only edge", () => {
  const mk = () => ({
    n: 8,
    mae: 0.5,
    rmse: 0.8,
    meanBias: 0.1,
    exactAgreementRate: 0.6,
    withinOneAgreementRate: 0.9,
    overScoringRate: 0.2,
    underScoringRate: 0.2,
  });

  it("TEST-CAL-009: content MAE above the ceiling → FAIL", () => {
    const metrics = {
      overall: mk(),
      perCriterion: {
        content: { ...mk(), mae: 3.5 },
        language: mk(),
        organization: mk(),
      },
      perLevel: [],
      perYear: [],
      perTask: [],
      perMarkerPolicy: [],
      levelMetrics: { n: 0, meanAbsoluteDistance: null, maxAbsoluteDistance: null, withinOneLevelRate: null },
    };
    const result = evaluateCalibrationGates({
      sampleCount: 10,
      scoredCount: 8,
      verifiedComparableCount: 8,
      policy: DEFAULT_CALIBRATION_GATE_POLICY,
      report: { metrics },
    });
    expect(result.decision).toBe("FAIL");
    expect(result.reasons.some(s => s.includes("maxContentMAE"))).toBe(true);
  });

  it("TEST-CAL-012: criterion-only dataset with sufficient counts → INSUFFICIENT_DATA", () => {
    const metrics = {
      overall: { n: 0, mae: null, rmse: null, meanBias: null, exactAgreementRate: null, withinOneAgreementRate: null, overScoringRate: null, underScoringRate: null },
      perCriterion: {
        content: { ...mk(), n: 10 },
        language: { ...mk(), n: 10 },
        organization: { ...mk(), n: 10 },
      },
      perLevel: [],
      perYear: [],
      perTask: [],
      perMarkerPolicy: [],
      levelMetrics: { n: 0, meanAbsoluteDistance: null, maxAbsoluteDistance: null, withinOneLevelRate: null },
    };
    const result = evaluateCalibrationGates({
      sampleCount: 10,
      scoredCount: 8,
      verifiedComparableCount: 8,
      policy: DEFAULT_CALIBRATION_GATE_POLICY,
      report: { metrics },
    });
    expect(result.decision).toBe("INSUFFICIENT_DATA");
    expect(result.reasons.join(" ")).toContain("insufficient-overall-comparable-pairs");
  });
});

// ============================================
// TEST-CAL-010 — ordinal level distance
// ============================================
describe("TEST-CAL-010 — ordinal level distances", () => {
  function comparison(published: string, predicted: string): CalibrationComparison {
    return {
      fixtureId: "f",
      year: 2024,
      taskId: "P2-2024-Q1",
      paper: "Paper 2",
      publishedLevel: published,
      predictedLevel: predicted,
      levelExactMatch: published === predicted,
      publishedOverall: null,
      predictedOverall: null,
      overallError: null,
      criterion: {
        content: { published: null, predicted: null, error: null },
        language: { published: null, predicted: null, error: null },
        organization: { published: null, predicted: null, error: null },
      },
      analysisFailure: null,
      verificationStatus: null,
    };
  }

  it("Level 4→Level 5 (distance 1) is NOT the same error as Level 4→Level 1 (distance 3)", () => {
    expect(parseOrdinalLevelIndex("4")).toBe(4);
    expect(parseOrdinalLevelIndex("5")).toBe(5);
    expect(parseOrdinalLevelIndex("1")).toBe(1);
    expect(parseOrdinalLevelIndex("5**")).toBe(5); // star-levels fold for distance
    expect(parseOrdinalLevelIndex("U")).toBe(0);
    expect(parseOrdinalLevelIndex("bogus")).toBeNull();

    const m = computeLevelAgreementMetrics([
      comparison("4", "5"), // distance 1
      comparison("4", "1"), // distance 3
    ]);
    expect(m.n).toBe(2);
    expect(m.meanAbsoluteDistance).toBe(2);
    expect(m.maxAbsoluteDistance).toBe(3);
    expect(m.withinOneLevelRate).toBe(0.5);
  });
});

// ============================================
// TEST-CAL-011 — attribution metadata
// ============================================
describe("TEST-CAL-011 — every run is attributable", () => {
  it("authoritative runner captures canonical scoringVersion + promptVersion", async () => {
    const report = await runCalibrationBenchmark({
      fixtures: [makeAuthoritativeFixture()],
      analyzer: fixedAnalyzer(70),
    });
    const md = report.runMetadata;
    expect(md).toBeDefined();
    expect(md?.scoringVersion).toBe(SCORING_VERSION);
    expect(md?.promptVersion).toBe("v1"); // canonical AnalyzeWriting registry entry
    expect(md?.calibrationVersion).toBe(CALIBRATION_VERSION);
    expect(md?.datasetVersion).toBe(CALIBRATION_DATASET_VERSION);
    expect(md?.datasetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    // Unknown values are declared unknown, never fabricated.
    expect(md?.provider).toBe("unavailable");
    expect(md?.model).toBe("unavailable");
    expect(md?.temperature).toBeNull();
    expect(md?.commitSha).toBeNull();
  });

  it("deterministic test analyzers declare themselves (never impersonate production)", async () => {
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [makeHumanFixture()],
      analyzer: fixedAnalyzer(70),
      runMetadata: {
        provider: "deterministic-test-analyzer",
        model: "deterministic-test-analyzer",
        temperature: 0,
        commitSha: "0000000000000000000000000000000000000000",
      },
    });
    expect(report.runMetadata?.provider).toBe("deterministic-test-analyzer");
    expect(report.runMetadata?.model).toBe("deterministic-test-analyzer");
    expect(report.runMetadata?.temperature).toBe(0);
    expect(report.runMetadata?.commitSha).toBe("0000000000000000000000000000000000000000");
    const rendered = renderCalibrationReport(report, undefined, {
      datasetDescription: "agreement with human-marker scored samples",
    });
    for (const key of ["calibrationVersion", "datasetVersion", "scoringVersion", "promptVersion", "provider", "model", "temperature", "commitSha"]) {
      expect(rendered).toContain(`| ${key} |`);
    }
  });

  it("human-marker runner reports evidence verification state (unverified is never verified)", async () => {
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [makeHumanFixture()],
      analyzer: fixedAnalyzer(70),
    });
    expect(report.evidenceVerification).toEqual({ verified: 0, unverified: 1, total: 1 });
    const rendered = renderCalibrationReport(report, undefined, {
      datasetDescription: "agreement with human-marker scored samples",
    });
    expect(rendered).toContain("HUMAN EVIDENCE VERIFICATION");
    expect(rendered).toContain("unverified (owner-asserted): 1");
  });
});

// ============================================
// TEST-CAL-015 — third-party source verification
// ============================================
describe("TEST-CAL-015 — third-party sources must declare verification", () => {
  it("third-party source without verificationRequired → INVALID", () => {
    const r = checkHumanMarkerEvidenceIntake({
      evidenceId: "evt-1",
      sourceDocument: "thirdparty-scored.pdf",
      year: 2024,
      paper: "Paper 2",
      task: "P2-2024-PartB-Q2",
      scriptText: "TEST-ONLY script text.",
      overallScore: 18,
      overallScale: 21,
      scoreLabel: "Overall: 18/21",
      provenanceOrganization: "website-y", // third-party, NOT hkeaa
    });
    const field = r.fields.find(f => f.field === "sourceVerification");
    expect(field?.status).toBe("INVALID");
    expect(r.reasons.some(s => s.includes("third-party"))).toBe(true);
  });

  it("third-party source WITH verificationRequired=true → declared but still unverified", () => {
    const r = checkHumanMarkerEvidenceIntake({
      evidenceId: "evt-2",
      sourceDocument: "thirdparty-scored.pdf",
      year: 2024,
      paper: "Paper 2",
      task: "P2-2024-PartB-Q2",
      scriptText: "TEST-ONLY script text.",
      overallScore: 18,
      overallScale: 21,
      scoreLabel: "Overall: 18/21",
      provenanceOrganization: "website-y",
      verificationRequired: true,
    });
    const field = r.fields.find(f => f.field === "sourceVerification");
    expect(field?.status).toBe("PRESENT");
    expect(field?.detail).toContain("UNVERIFIED");
  });
});
