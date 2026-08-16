// ============================================
// R3.10-K Phase 8 — Evidence Integrity Tests
//
// TEST-CAL-016 / 017 — dataset fingerprint mutation sensitivity (P0 F1)
// TEST-CAL-018 — verified-comparable gate at the runner level
// TEST-CAL-024 — inter-rater schema (disagreement visibility, no AI fields)
// TEST-CAL-025 — marker protocol / blindness guards
// Plus: ground-truth classifier + task/part scope exclusion.
//
// All fixtures here are clearly-labelled synthetic TEST fixtures —
// never real evidence, never checked into authoritative directories.
// ============================================

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildHumanMarkerFixtureId,
  classifyGroundTruthClass,
  computeDatasetFingerprint,
  runHumanMarkerCalibrationBenchmark,
  validateHumanMarkerEvidenceSet,
  validateHumanMarkerFixture,
  type DatasetFingerprintEntry,
  type HumanMarkerCalibrationFixture,
} from "../index";
import { computeProvenanceHash } from "../provenance";

const TEST_HASH = computeProvenanceHash(["phase8-test-source"]);
const MODULE_DIR = resolve(__dirname, "..");

function fingerprintEntry(
  overrides: Partial<DatasetFingerprintEntry> = {},
): DatasetFingerprintEntry {
  return {
    id: "hm-2024-p2-p2-2024-partb-q2-class-5a-candidate-07",
    sourceHash: TEST_HASH,
    contentScore: 7,
    languageScore: 7,
    organizationScore: 7,
    overallScore: null,
    publishedLevel: "5**",
    rubricVersion: "DSE-P2-2012",
    verificationStatus: "unverified",
    ...overrides,
  };
}

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
        verificationRequired: true,
        verificationStatus: "unverified",
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
      ...(overrides.provenance ?? {}),
      sectionId: `Class 5A candidate ${String(n).padStart(2, "0")}`,
    },
  });
}

const perfectAnalyzer = async () => ({
  overallScore: 60,
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
// TEST-CAL-016 / 017 — fingerprint mutation sensitivity
// ============================================
describe("TEST-CAL-016/017 — dataset fingerprint is ground-truth sensitive", () => {
  const baseline = computeDatasetFingerprint([fingerprintEntry()]);

  it("TEST-CAL-016: changing a criterion score changes the fingerprint", () => {
    expect(baseline).not.toBeNull();
    expect(computeDatasetFingerprint([fingerprintEntry({ contentScore: 6 })]))
      .not.toBe(baseline);
    expect(computeDatasetFingerprint([fingerprintEntry({ languageScore: 6 })]))
      .not.toBe(baseline);
    expect(computeDatasetFingerprint([fingerprintEntry({ organizationScore: 6 })]))
      .not.toBe(baseline);
    expect(computeDatasetFingerprint([fingerprintEntry({ overallScore: 18 })]))
      .not.toBe(baseline);
  });

  it("TEST-CAL-017: evidence identity/state mutation changes the fingerprint", () => {
    expect(computeDatasetFingerprint([fingerprintEntry({ rubricVersion: "DSE-P2-2016" })]))
      .not.toBe(baseline);
    expect(computeDatasetFingerprint([fingerprintEntry({ verificationStatus: "verified" })]))
      .not.toBe(baseline);
    expect(computeDatasetFingerprint([fingerprintEntry({ publishedLevel: "5" })]))
      .not.toBe(baseline);
    // Marker identity + adjudication state also move the fingerprint.
    expect(computeDatasetFingerprint([fingerprintEntry({
      markerScores: [{
        markerId: "marker-anon-01", contentScore: 7, languageScore: 7,
        organizationScore: 7, overallScore: null, markedAt: "2026-08-01T00:00:00Z",
      }],
    })])).not.toBe(baseline);
    expect(computeDatasetFingerprint([fingerprintEntry({
      adjudication: { status: "resolved", adjudicatorId: "adj-1", resolvedAt: "2026-08-02T00:00:00Z", notes: null },
    })])).not.toBe(baseline);
  });

  it("fingerprint is deterministic and order-independent", () => {
    const a = computeDatasetFingerprint([
      fingerprintEntry({ id: "a" }),
      fingerprintEntry({ id: "b" }),
    ]);
    const b = computeDatasetFingerprint([
      fingerprintEntry({ id: "b" }),
      fingerprintEntry({ id: "a" }),
    ]);
    expect(a).toBe(b);
    const c = computeDatasetFingerprint([fingerprintEntry({ id: "a" }), fingerprintEntry({ id: "b" })]);
    expect(a).toBe(c);
  });

  it("empty dataset has null fingerprint (never a fake identity)", () => {
    expect(computeDatasetFingerprint([])).toBeNull();
  });

  // ============================================
  // P2-A — comparability semantics move the fingerprint
  // ============================================
  it("P2-A: taskPartScope mutation changes the fingerprint", () => {
    expect(computeDatasetFingerprint([fingerprintEntry({ taskPartScope: "paper-2-part-a" })]))
      .not.toBe(computeDatasetFingerprint([fingerprintEntry({ taskPartScope: "paper-2-part-b" })]));
    expect(computeDatasetFingerprint([fingerprintEntry({ taskPartScope: null })]))
      .not.toBe(computeDatasetFingerprint([fingerprintEntry({ taskPartScope: "paper-2-part-b" })]));
  });

  it("P2-A: comparabilityNotes mutation changes the fingerprint", () => {
    expect(computeDatasetFingerprint([fingerprintEntry({ comparabilityNotes: "note-a" })]))
      .not.toBe(computeDatasetFingerprint([fingerprintEntry({ comparabilityNotes: "note-b" })]));
  });

  it("P2-A: reordered markerScores keep the same fingerprint", () => {
    const mk = (markerId: string, contentScore: number) => ({
      markerId, contentScore, languageScore: 7, organizationScore: 7,
      overallScore: null, markedAt: "2026-08-01T00:00:00Z",
    });
    const a = computeDatasetFingerprint([fingerprintEntry({
      markerScores: [mk("marker-A", 6), mk("marker-B", 5)],
    })]);
    const b = computeDatasetFingerprint([fingerprintEntry({
      markerScores: [mk("marker-B", 5), mk("marker-A", 6)],
    })]);
    expect(a).toBe(b);
  });

  it("P2-A: reordered subScores keep the same fingerprint", () => {
    const a = computeDatasetFingerprint([fingerprintEntry({
      subScores: [{ label: "M1", value: 21 }, { label: "M2", value: 19 }],
    })]);
    const b = computeDatasetFingerprint([fingerprintEntry({
      subScores: [{ label: "M2", value: 19 }, { label: "M1", value: 21 }],
    })]);
    expect(a).toBe(b);
  });

  it("P2-A: marker disagreement mutation changes the fingerprint", () => {
    const mk = (contentScore: number) => [{
      markerId: "marker-B", contentScore, languageScore: 7, organizationScore: 7,
      overallScore: null, markedAt: "2026-08-01T00:00:00Z",
    }];
    expect(computeDatasetFingerprint([fingerprintEntry({ markerScores: mk(4) })]))
      .not.toBe(computeDatasetFingerprint([fingerprintEntry({ markerScores: mk(5) })]));
  });

  it("P2-A: adjudication mutation changes the fingerprint", () => {
    expect(computeDatasetFingerprint([fingerprintEntry({
      adjudication: { status: "pending", adjudicatorId: null, resolvedAt: null, notes: null },
    })])).not.toBe(computeDatasetFingerprint([fingerprintEntry({
      adjudication: { status: "resolved", adjudicatorId: null, resolvedAt: null, notes: null },
    })]));
  });

  it("P2-A: verificationStatus mutation changes the fingerprint", () => {
    expect(computeDatasetFingerprint([fingerprintEntry({ verificationStatus: "unverified" })]))
      .not.toBe(computeDatasetFingerprint([fingerprintEntry({ verificationStatus: "verified" })]));
  });
});

// ============================================
// TEST-CAL-018 — verified-evidence gate (runner level)
// ============================================
describe("TEST-CAL-018 — unverified evidence never reaches PASS", () => {
  it("10 unverified comparable fixtures → INSUFFICIENT_DATA", async () => {
    const fixtures = Array.from({ length: 10 }, (_, i) => fixtureN(i + 1)); // unverified by default
    const report = await runHumanMarkerCalibrationBenchmark({ fixtures, analyzer: perfectAnalyzer });
    expect(report.gate.decision).toBe("INSUFFICIENT_DATA");
    expect(report.gate.reasons.join(" ")).toContain("insufficient-verified-comparable-samples");
  });

  it("10 verified comparable fixtures → proceeds to metric evaluation (PASS)", async () => {
    const fixtures = Array.from({ length: 10 }, (_, i) =>
      fixtureN(i + 1, {
        provenance: {
          ...makeHumanFixture().provenance,
          sourceAuthorityAssertion: {
            ...makeHumanFixture().provenance.sourceAuthorityAssertion,
            verificationStatus: "verified",
          },
        },
      }));
    const report = await runHumanMarkerCalibrationBenchmark({ fixtures, analyzer: perfectAnalyzer });
    expect(report.gate.decision).toBe("PASS");
  });

  it("verificationStatus mutation alone flips sufficiency (D)", async () => {
    const base = Array.from({ length: 8 }, (_, i) => fixtureN(i + 1));
    const unverified = await runHumanMarkerCalibrationBenchmark({ fixtures: base, analyzer: perfectAnalyzer });
    expect(unverified.gate.decision).toBe("INSUFFICIENT_DATA");
    const verified = base.map(f => ({
      ...f,
      provenance: {
        ...f.provenance,
        sourceAuthorityAssertion: { ...f.provenance.sourceAuthorityAssertion, verificationStatus: "verified" as const },
      },
    }));
    const vReport = await runHumanMarkerCalibrationBenchmark({ fixtures: verified, analyzer: perfectAnalyzer });
    // 8 samples < minAuthoritativeSamples(10): sufficiency gate still applies.
    expect(vReport.gate.decision).toBe("INSUFFICIENT_DATA");
    expect(vReport.gate.reasons.join(" ")).not.toContain("insufficient-verified-comparable-samples");
  });
});

// ============================================
// TEST-CAL-024 — inter-rater disagreement visibility
// ============================================
describe("TEST-CAL-024 — inter-rater schema", () => {
  it("multi-marker disagreement is representable and not collapsed", () => {
    const fixture = makeHumanFixture({
      markerScores: [
        { markerId: "marker-A", contentScore: 6, languageScore: 5, organizationScore: 5, overallScore: null, markedAt: "2026-08-01T00:00:00Z" },
        { markerId: "marker-B", contentScore: 5, languageScore: 5, organizationScore: 5, overallScore: null, markedAt: "2026-08-01T01:00:00Z" },
      ],
      adjudication: { status: "disagreement-visible", adjudicatorId: null, resolvedAt: null, notes: "disagreement recorded — never collapsed" },
    });
    expect(validateHumanMarkerFixture(fixture).ok).toBe(true);
    expect(fixture.markerScores).toHaveLength(2);
    expect(fixture.markerScores?.[0].contentScore).not.toBe(fixture.markerScores?.[1].contentScore);
    expect(fixture.adjudication?.status).toBe("disagreement-visible");
  });

  it("AI prediction fields are rejected in markerScores", () => {
    const fixture = makeHumanFixture({
      markerScores: [
        {
          markerId: "marker-A", contentScore: 6, languageScore: 5,
          organizationScore: 5, overallScore: null, markedAt: null,
          aiScore: 95, // forbidden — AI prediction fields never accepted
        } as unknown as never,
      ],
    });
    const result = validateHumanMarkerFixture(fixture);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("forbidden keys");
    expect(result.errors.join(" ")).toContain("aiScore");
  });

  it("invalid adjudication status is rejected", () => {
    const fixture = makeHumanFixture({
      adjudication: { status: "auto-resolved" as never, adjudicatorId: null, resolvedAt: null, notes: null },
    });
    expect(validateHumanMarkerFixture(fixture).ok).toBe(false);
  });
});

// ============================================
// TEST-CAL-025 — marker protocol / blindness guards
// ============================================
describe("TEST-CAL-025 — marker protocol and schema blindness", () => {
  const protocolPath = join(MODULE_DIR, "MARKER_PROTOCOL.md");

  it("MARKER_PROTOCOL.md exists", () => {
    expect(existsSync(protocolPath)).toBe(true);
  });

  it("protocol prohibits AI score / feedback / target-level exposure", () => {
    const text = readFileSync(protocolPath, "utf-8");
    expect(text).toContain("does NOT see any AI score");
    expect(text).toContain("does NOT see any AI feedback");
    expect(text).toContain("does NOT see any pedagogical target level");
  });

  it("protocol states verification semantics explicitly", () => {
    const text = readFileSync(protocolPath, "utf-8")
      .replace(/>/g, " ")
      .replace(/\s+/g, " ");
    expect(text).toContain(
      "ground truth only after the defined verification/adjudication process",
    );
    expect(text).toContain("publication authority alone does not automatically establish verified ground truth");
  });

  it("human-marker fixture schema contains no AI prediction fields", () => {
    const typesSource = readFileSync(join(MODULE_DIR, "types.ts"), "utf-8");
    const block = typesSource.slice(
      typesSource.indexOf("export interface HumanMarkerCalibrationFixture {"),
      typesSource.indexOf("export type HumanMarkerEvidenceClass"),
    );
    for (const forbidden of ["aiScore", "modelScore", "predictedLevel", "aiFeedback", "pedagogicalTargetLevel", "targetLevel"]) {
      expect(block, `${forbidden} must not appear in the human-marker fixture schema`).not.toContain(forbidden);
    }
  });
});

// ============================================
// Ground-truth classifier (P3-F9) + task/part scope
// ============================================
describe("Ground-truth classification (Phase 8)", () => {
  it("maps evidence to consolidated classes", () => {
    expect(classifyGroundTruthClass({ kind: "human-marker-calibration", evidenceClass: "ACCEPT_OVERALL_SCORE", verificationStatus: "verified" }))
      .toBe("HUMAN_MARKER_GROUND_TRUTH");
    expect(classifyGroundTruthClass({ kind: "human-marker-calibration", evidenceClass: "ACCEPT_OVERALL_SCORE", verificationStatus: "unverified" }))
      .toBe("HUMAN_MARKER_UNVERIFIED");
    expect(classifyGroundTruthClass({ kind: "human-marker-calibration", evidenceClass: "NON_COMPARABLE_SCORE", verificationStatus: "unverified" }))
      .toBe("NON_COMPARABLE_HUMAN_EVIDENCE");
    expect(classifyGroundTruthClass({ kind: "authoritative-calibration" }))
      .toBe("HUMAN_PUBLICATION_LEVEL_ONLY");
    expect(classifyGroundTruthClass({ kind: "synthetic-regression" }))
      .toBe("SYNTHETIC_PLATFORM_FIXTURE");
    expect(classifyGroundTruthClass({ kind: "unknown", goldenType: "AI_AUTHORED_REGRESSION_BASELINE" }))
      .toBe("AI_AUTHORED_REGRESSION_BASELINE");
    expect(classifyGroundTruthClass({ kind: "garbage" }))
      .toBe("SYNTHETIC_PLATFORM_FIXTURE"); // fail-safe — never ground truth
  });

  it("clo-total-0-21 overall score without compatible scope is excluded from comparison", async () => {
    const noScope = makeHumanFixture({
      overallScore: 15,
      scoreProvenance: {
        suppliedBy: "human-marker",
        overallScoreDirectlyScored: true,
        criterionScoresDirectlyScored: false,
        overallScoreBasis: "clo-total-0-21",
        criterionScoreBasis: null,
        scoringMethod: "single marking",
      },
      // taskPartScope intentionally ABSENT → ambiguous scope
    });
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [noScope],
      analyzer: perfectAnalyzer,
    });
    expect(report.comparisons[0].publishedOverall).toBeNull();
    expect(report.comparisons[0].overallError).toBeNull();
    expect(report.insufficientAreas.some(a => a.area === "scope-ambiguous-excluded")).toBe(true);

    const withScope = makeHumanFixture({
      overallScore: 15,
      taskPartScope: "paper-2-part-b",
      scoreProvenance: {
        suppliedBy: "human-marker",
        overallScoreDirectlyScored: true,
        criterionScoresDirectlyScored: false,
        overallScoreBasis: "clo-total-0-21",
        criterionScoreBasis: null,
        scoringMethod: "single marking",
      },
    });
    const scopedReport = await runHumanMarkerCalibrationBenchmark({
      fixtures: [withScope],
      analyzer: perfectAnalyzer,
    });
    expect(scopedReport.comparisons[0].publishedOverall).toBe(15);
  });
});

// ============================================
// R3.10-K Phase 8 Step 4 — P1: verified COMPARABLE PAIRS authority
// ============================================
describe("P1 — sufficiency counts ACTUAL verified comparable pairs", () => {
  function verified(fixture: HumanMarkerCalibrationFixture): HumanMarkerCalibrationFixture {
    return {
      ...fixture,
      provenance: {
        ...fixture.provenance,
        sourceAuthorityAssertion: {
          ...fixture.provenance.sourceAuthorityAssertion,
          verificationStatus: "verified",
        },
      },
    };
  }

  function scopeExcluded(n: number): HumanMarkerCalibrationFixture {
    // clo-total-0-21 overall WITHOUT taskPartScope → excluded at comparison.
    return verified(fixtureN(n, {
      overallScore: 15,
      scoreProvenance: {
        suppliedBy: "human-marker",
        overallScoreDirectlyScored: true,
        criterionScoresDirectlyScored: false,
        overallScoreBasis: "clo-total-0-21",
        criterionScoreBasis: null,
        scoringMethod: "single marking",
      },
      // taskPartScope intentionally absent
    }));
  }

  function validPair(n: number): HumanMarkerCalibrationFixture {
    return verified(fixtureN(n)); // percentage basis 60, comparable overall pair
  }

  function criterionOnly(n: number): HumanMarkerCalibrationFixture {
    return verified(fixtureN(n, {
      overallScore: null,
      contentScore: 5,
      languageScore: 5,
      organizationScore: 5,
      scoreProvenance: {
        suppliedBy: "human-marker",
        overallScoreDirectlyScored: false,
        criterionScoresDirectlyScored: true,
        overallScoreBasis: null,
        criterionScoreBasis: "clo-0-7",
        scoringMethod: "single marking, CLO rubric",
      },
    }));
  }

  it("TEST-CAL-026: 8 verified scope-excluded + 2 verified valid pairs → INSUFFICIENT_DATA (never PASS)", async () => {
    const fixtures = [
      ...Array.from({ length: 8 }, (_, i) => scopeExcluded(i + 1)),
      validPair(9),
      validPair(10),
    ];
    const report = await runHumanMarkerCalibrationBenchmark({ fixtures, analyzer: perfectAnalyzer });
    // The attack: 10 verified fixtures, but only 2 ACTUAL overall pairs.
    expect(report.sampleCount).toBe(10);
    expect(report.metrics.overall.n).toBe(2); // actual pairs, not fixtures
    expect(report.gate.decision).toBe("INSUFFICIENT_DATA");
    expect(report.gate.decision).not.toBe("PASS");
  });

  it("TEST-CAL-027: 8 verified ACTUAL pairs + 2 criterion-only → metric evaluation (good PASS / bad FAIL)", async () => {
    const fixtures = [
      ...Array.from({ length: 8 }, (_, i) => validPair(i + 1)),
      criterionOnly(9),
      criterionOnly(10),
    ];
    const good = await runHumanMarkerCalibrationBenchmark({ fixtures, analyzer: perfectAnalyzer });
    expect(good.metrics.overall.n).toBe(8);
    expect(good.gate.decision).toBe("PASS");

    const badAnalyzer = async () => ({ ...(await perfectAnalyzer()), overallScore: 70 });
    const bad = await runHumanMarkerCalibrationBenchmark({ fixtures, analyzer: badAnalyzer });
    expect(bad.gate.decision).toBe("FAIL");
  });

  it("TEST-CAL-028: criterion-only + scope-excluded + < required pairs → INSUFFICIENT_DATA", async () => {
    const fixtures = [
      criterionOnly(1),
      criterionOnly(2),
      criterionOnly(3),
      scopeExcluded(4),
      scopeExcluded(5),
      scopeExcluded(6),
      validPair(7),
      validPair(8),
    ];
    const report = await runHumanMarkerCalibrationBenchmark({ fixtures, analyzer: perfectAnalyzer });
    expect(report.metrics.overall.n).toBe(2);
    expect(report.gate.decision).toBe("INSUFFICIENT_DATA");
    expect(report.gate.reasons.join(" ")).not.toContain("all policy thresholds met");
  });
});

// ============================================
// R3.10-K Phase 8 Step 4 — P2-B: dedup integrity
// ============================================
describe("P2-B — semantically distinct evidence is never deduplicated", () => {
  const mk = (markerId: string, contentScore: number) => ({
    markerId, contentScore, languageScore: 7, organizationScore: 7,
    overallScore: null, markedAt: "2026-08-01T00:00:00Z",
  });

  it("TEST-CAL-029: differing markerScores disagreement → conflict, never duplicate", () => {
    const A = makeHumanFixture({ markerScores: [mk("marker-A", 6), mk("marker-B", 4)] });
    const B = makeHumanFixture({ markerScores: [mk("marker-A", 6), mk("marker-B", 5)] });
    const set = validateHumanMarkerEvidenceSet([A, B]);
    expect(set.ok).toBe(false);
    expect(set.conflicts).toHaveLength(1);
    expect(set.duplicates).toHaveLength(0);
  });

  it("TEST-CAL-030: differing adjudication → conflict, never duplicate", () => {
    const A = makeHumanFixture();
    const B = makeHumanFixture({
      adjudication: { status: "resolved", adjudicatorId: "adj-1", resolvedAt: "2026-08-02T00:00:00Z", notes: "x" },
    });
    const set = validateHumanMarkerEvidenceSet([A, B]);
    expect(set.ok).toBe(false);
    expect(set.conflicts).toHaveLength(1);
    expect(set.duplicates).toHaveLength(0);
  });

  it("TEST-CAL-031: reordered markerScores (same semantics) → identical duplicate", () => {
    const A = makeHumanFixture({ markerScores: [mk("marker-A", 6), mk("marker-B", 5)] });
    const B = makeHumanFixture({ markerScores: [mk("marker-B", 5), mk("marker-A", 6)] });
    const set = validateHumanMarkerEvidenceSet([A, B]);
    expect(set.ok).toBe(true);
    expect(set.duplicates).toHaveLength(1);
    expect(set.conflicts).toHaveLength(0);
  });

  it("TEST-CAL-032: differing taskPartScope → conflict, never duplicate", () => {
    const A = makeHumanFixture({ taskPartScope: "paper-2-part-a" });
    const B = makeHumanFixture({ taskPartScope: "paper-2-part-b" });
    const set = validateHumanMarkerEvidenceSet([A, B]);
    expect(set.ok).toBe(false);
    expect(set.conflicts).toHaveLength(1);
  });

  it("TEST-CAL-033: differing verificationStatus → conflict, never duplicate", () => {
    const A = makeHumanFixture();
    const B = makeHumanFixture({
      provenance: {
        ...makeHumanFixture().provenance,
        sourceAuthorityAssertion: {
          ...makeHumanFixture().provenance.sourceAuthorityAssertion,
          verificationStatus: "verified",
        },
      },
    });
    const set = validateHumanMarkerEvidenceSet([A, B]);
    expect(set.ok).toBe(false);
    expect(set.conflicts).toHaveLength(1);
    expect(set.duplicates).toHaveLength(0);
  });
});
