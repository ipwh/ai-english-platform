// ============================================
// R3.10-K Phase 9 — Evidence Acquisition Pipeline Tests
//
// TEST-CAL-034..059: intake, verification, blind marking, adjudication,
// freeze. All fixtures are clearly-labelled synthetic TEST fixtures —
// never real evidence.
// ============================================

import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildHumanMarkerFixtureId,
  buildMarkerPack,
  serializeMarkerPack,
  appendMarkerScore,
  applyAdjudication,
  ingestExternalEvidence,
  writeIntakeOutput,
  IntakeRejectedError,
  MarkingRejectedError,
  FreezeBlockedError,
  runFreeze,
  writeFreezeOutput,
  runHumanMarkerCalibrationBenchmark,
  effectiveVerificationStatus,
  computeDatasetFingerprint,
  humanMarkerFingerprintEntry,
  validateHumanMarkerFixture,
  type ExternalEvidenceSubmission,
  type HumanMarkerCalibrationFixture,
} from "../index";
import { computeProvenanceHash } from "../provenance";

const SHA = computeProvenanceHash(["phase9-test-source"]);

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "cal-p9-"));
}

function validSubmission(overrides: Partial<ExternalEvidenceSubmission> = {}): ExternalEvidenceSubmission {
  return {
    evidenceId: "candidate-01",
    sourceDocument: "TEST-ONLY school exam booklet.pdf",
    sourceHash: SHA,
    year: 2025,
    paper: "Paper 2",
    task: "P2-2025-PartB-Q1",
    taskPartScope: "paper-2-part-b",
    scriptText: "TEST-ONLY synthetic script: recycling reduces plastic waste in schools.",
    scriptAuthorship: "HUMAN_AUTHORED",
    overallScore: 18,
    overallScale: 21,
    scoreLabel: "Overall: 18/21",
    markerBasis: "official-marking-record",
    provenanceOrganization: "school-x",
    ...overrides,
  };
}

function writeFixture(dir: string, fixture: HumanMarkerCalibrationFixture): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${fixture.id}.json`), `${JSON.stringify(fixture, null, 2)}\n`, "utf-8");
}

function verifiedFixture(overrides: Partial<HumanMarkerCalibrationFixture> = {}): HumanMarkerCalibrationFixture {
  const base = ingestExternalEvidence(validSubmission({
    evidenceId: "candidate-verified",
  }));
  return {
    ...base,
    ...overrides,
    verification: {
      status: "verified",
      verifiedBy: "human-verifier-1",
      verifiedAt: "2026-08-17T00:00:00.000Z",
      confirmedSourceHash: base.provenance.sourceHash,
      scriptIdentityConfirmed: true,
      scoreSourceConfirmed: true,
    },
  };
}

// ============================================
// R1 — external intake (TEST-CAL-034..038)
// ============================================
describe("R1 — safe external intake", () => {
  it("TEST-CAL-034: HUMAN_AUTHORED submission is accepted as UNVERIFIED evidence", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    expect(validateHumanMarkerFixture(fixture).ok).toBe(true);
    expect(fixture.scriptAuthorship).toBe("HUMAN_AUTHORED");
    expect(fixture.verification?.status).toBe("unverified");
    expect(effectiveVerificationStatus(fixture)).toBe("unverified");
    expect(fixture.overallScore).toBe(18);
  });

  it("TEST-CAL-035: AI_AUTHORED submission is rejected fail-closed", () => {
    expect(() => ingestExternalEvidence(validSubmission({ scriptAuthorship: "AI_AUTHORED" })))
      .toThrow(IntakeRejectedError);
  });

  it("TEST-CAL-036: UNKNOWN / missing authorship is rejected", () => {
    expect(() => ingestExternalEvidence(validSubmission({ scriptAuthorship: "UNKNOWN" })))
      .toThrow(IntakeRejectedError);
    const { scriptAuthorship: _dropped, ...missing } = validSubmission();
    expect(() => ingestExternalEvidence(missing as never)).toThrow(IntakeRejectedError);
  });

  it("TEST-CAL-037: invalid submissions (bad scale / missing script) fail closed", () => {
    expect(() => ingestExternalEvidence(validSubmission({ overallScale: 42 })))
      .toThrow(IntakeRejectedError);
    expect(() => ingestExternalEvidence(validSubmission({ scriptText: "   " })))
      .toThrow(IntakeRejectedError);
    // Level-only submissions are never human-marker evidence.
    expect(() => ingestExternalEvidence(validSubmission({
      overallScore: undefined, overallScale: undefined, scoreLabel: undefined,
      contentScore: undefined, languageScore: undefined, organizationScore: undefined,
    }))).toThrow(IntakeRejectedError);
  });

  it("TEST-CAL-038: intake output remains unverified and the writer is immutable", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const dir = tmpDir();
    const first = writeIntakeOutput([fixture], dir);
    expect(first.written).toHaveLength(1);
    const again = writeIntakeOutput([fixture], dir);
    expect(again.unchanged).toHaveLength(1);
    expect(effectiveVerificationStatus(fixture)).toBe("unverified");
  });
});

// ============================================
// R2 — explicit verification (TEST-CAL-039..044)
// ============================================
describe("R2 — explicit verification", () => {
  it("TEST-CAL-039: new evidence defaults to unverified", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    expect(fixture.verification?.status).toBe("unverified");
    expect(effectiveVerificationStatus(fixture)).toBe("unverified");
  });

  it("TEST-CAL-040: verified status requires an explicit human actor", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const bad = {
      ...fixture,
      verification: { status: "verified" as const, verifiedAt: "2026-08-17T00:00:00.000Z" },
    };
    expect(validateHumanMarkerFixture(bad).ok).toBe(false);
    expect(validateHumanMarkerFixture(bad).errors.join(" ")).toContain("verifiedBy");
  });

  it("TEST-CAL-041: verification records the timestamp and passes validation", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const verified = {
      ...fixture,
      verification: {
        status: "verified" as const,
        verifiedBy: "human-verifier-1",
        verifiedAt: "2026-08-17T09:30:00.000Z",
        confirmedSourceHash: fixture.provenance.sourceHash,
        scriptIdentityConfirmed: true,
        scoreSourceConfirmed: true,
      },
    };
    expect(validateHumanMarkerFixture(verified).ok).toBe(true);
    expect(verified.verification?.verifiedAt).toBe("2026-08-17T09:30:00.000Z");
  });

  it("TEST-CAL-042: verification cannot bypass the source hash", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const bad = {
      ...fixture,
      verification: {
        status: "verified" as const,
        verifiedBy: "human-verifier-1",
        verifiedAt: "2026-08-17T00:00:00.000Z",
        confirmedSourceHash: "0".repeat(64),
      },
    };
    const result = validateHumanMarkerFixture(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("cannot bypass the source hash");
  });

  it("TEST-CAL-043: verification mutation changes the dataset fingerprint", () => {
    const unverified = ingestExternalEvidence(validSubmission());
    const verified = {
      ...unverified,
      verification: {
        status: "verified" as const,
        verifiedBy: "human-verifier-1",
        verifiedAt: "2026-08-17T09:30:00.000Z",
        confirmedSourceHash: unverified.provenance.sourceHash,
        scriptIdentityConfirmed: true,
        scoreSourceConfirmed: true,
      },
    };
    expect(computeDatasetFingerprint([humanMarkerFingerprintEntry(unverified)]))
      .not.toBe(computeDatasetFingerprint([humanMarkerFingerprintEntry(verified)]));
  });

  it("TEST-CAL-044: no automatic verification path — runner never verifies", async () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [fixture],
      analyzer: async () => ({
        overallScore: 86,
        contentScore: 5, languageScore: 5, organizationScore: 5,
        cloTotalScore: 18, dseLevel: "4", platformWritingEstimate: "4",
        strengths: [], weaknesses: [], grammarErrors: [], chinglishWarnings: [],
        vocabularySuggestions: [], structureFeedback: "x", generalComment: "x",
      }),
    });
    expect(report.evidenceVerification?.verified).toBe(0);
    expect(report.gate.decision).toBe("INSUFFICIENT_DATA");
  });
});

// ============================================
// R3 — blind marking + adjudication (TEST-CAL-045..051)
// ============================================
describe("R3 — blind marking and adjudication", () => {
  it("TEST-CAL-045: blinded marker pack contains no AI/score/other-marker fields", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const pack = buildMarkerPack(fixture);
    const raw = JSON.stringify(pack);
    for (const forbidden of [
      "aiScore", "predictedScore", "modelScore", "aiFeedback",
      "overallScore", "contentScore", "languageScore", "organizationScore",
      "markerScores", "adjudication", "pedagogicalTargetLevel", "provider",
    ]) {
      expect(raw, `${forbidden} must not appear in a marker pack`).not.toContain(forbidden);
    }
    expect(raw).toContain(fixture.studentScript);
    expect(raw).toContain(fixture.provenance.taskId);
  });

  it("TEST-CAL-046: marker submission is append-only", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const a = appendMarkerScore(fixture, {
      markerId: "marker-A", contentScore: 5, languageScore: 5,
      organizationScore: 5, overallScore: null, markedAt: "2026-08-17T01:00:00Z",
    });
    const b = appendMarkerScore(a, {
      markerId: "marker-B", contentScore: 6, languageScore: 5,
      organizationScore: 5, overallScore: null, markedAt: "2026-08-17T02:00:00Z",
    });
    expect(b.markerScores).toHaveLength(2);
    expect(b.studentScript).toBe(fixture.studentScript); // script untouched
    expect(() => appendMarkerScore(b, {
      markerId: "marker-A", contentScore: 7, languageScore: 5,
      organizationScore: 5, overallScore: null, markedAt: "2026-08-17T03:00:00Z",
    })).toThrow(MarkingRejectedError);
  });

  it("TEST-CAL-047: marker A/B scores remain independent", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const a = appendMarkerScore(fixture, {
      markerId: "marker-A", contentScore: 5, languageScore: 5,
      organizationScore: 5, overallScore: null, markedAt: "2026-08-17T01:00:00Z",
    });
    const before = JSON.stringify(a.markerScores);
    const b = appendMarkerScore(a, {
      markerId: "marker-B", contentScore: 6, languageScore: 6,
      organizationScore: 6, overallScore: null, markedAt: "2026-08-17T02:00:00Z",
    });
    expect(JSON.stringify(b.markerScores?.[0])).toBe(JSON.stringify(a.markerScores?.[0]));
    expect(before).not.toBe(JSON.stringify(b.markerScores));
  });

  it("TEST-CAL-048: disagreement remains visible (never collapsed)", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const marked = appendMarkerScore(appendMarkerScore(fixture, {
      markerId: "marker-A", contentScore: 5, languageScore: 5,
      organizationScore: 5, overallScore: null, markedAt: "2026-08-17T01:00:00Z",
    }), {
      markerId: "marker-B", contentScore: 7, languageScore: 5,
      organizationScore: 4, overallScore: null, markedAt: "2026-08-17T02:00:00Z",
    });
    expect(marked.markerScores?.[0].contentScore).not.toBe(marked.markerScores?.[1].contentScore);
    expect(marked.overallScore).toBe(fixture.overallScore); // top-level untouched
  });

  it("TEST-CAL-049: adjudication never overwrites original scores", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const marked = appendMarkerScore(fixture, {
      markerId: "marker-A", contentScore: 5, languageScore: 5,
      organizationScore: 5, overallScore: null, markedAt: "2026-08-17T01:00:00Z",
    });
    const adjudicated = applyAdjudication(marked, {
      status: "resolved",
      adjudicatorId: "adj-1",
      resolvedAt: "2026-08-17T09:00:00Z",
      notes: null,
      reason: "marker disagreement on content",
      resolution: "content resolved to 6",
      resolvedScores: { contentScore: 6, languageScore: 5, organizationScore: 5, overallScore: null },
    });
    expect(adjudicated.markerScores?.[0].contentScore).toBe(5); // original preserved
    expect(adjudicated.contentScore).toBe(fixture.contentScore);
    expect(adjudicated.adjudication?.resolvedScores?.contentScore).toBe(6);
    expect(() => applyAdjudication(adjudicated, {
      status: "resolved", adjudicatorId: "adj-2", resolvedAt: "2026-08-17T10:00:00Z", notes: null,
    })).toThrow(MarkingRejectedError); // immutable once resolved
  });

  it("TEST-CAL-050: a marker pack never exposes another marker's score", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const marked = appendMarkerScore(fixture, {
      markerId: "marker-SECRET", contentScore: 5, languageScore: 5,
      organizationScore: 5, overallScore: null, markedAt: "2026-08-17T01:00:00Z",
    });
    const pack = buildMarkerPack(marked);
    const raw = JSON.stringify(pack);
    expect(raw).not.toContain("marker-SECRET");
    expect(raw).not.toContain("contentScore");
  });

  it("TEST-CAL-051: marker pack generation is deterministic", () => {
    const fixture = ingestExternalEvidence(validSubmission());
    const a = serializeMarkerPack(buildMarkerPack(fixture, { markerIndex: 1 }));
    const b = serializeMarkerPack(buildMarkerPack(fixture, { markerIndex: 1 }));
    expect(a).toBe(b);
    const c = serializeMarkerPack(buildMarkerPack(fixture, { markerIndex: 2 }));
    expect(c).not.toBe(a);
  });
});

// ============================================
// R4 — dataset freeze (TEST-CAL-052..059)
// ============================================
describe("R4 — dataset freeze", () => {
  it("TEST-CAL-052: unverified comparable fixture blocks freeze", () => {
    const dir = tmpDir();
    writeFixture(dir, ingestExternalEvidence(validSubmission()));
    const result = runFreeze({ fixturesDir: dir, outDir: tmpDir(), now: () => "2026-08-17T00:00:00.000Z" });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("unverified comparable fixture blocks freeze");
  });

  it("TEST-CAL-053: fingerprint mismatch with same version blocks freeze", () => {
    const dir = tmpDir();
    writeFixture(dir, verifiedFixture());
    const outDir = tmpDir();
    const first = runFreeze({ fixturesDir: dir, outDir, now: () => "2026-08-17T00:00:00.000Z" });
    expect(first.ok).toBe(true);
    writeFreezeOutput(first, outDir);
    // Mutate the dataset: add another verified fixture → truth changed.
    writeFixture(dir, verifiedFixture({ id: buildHumanMarkerFixtureId({
      year: 2026, paper: "Paper 2", taskId: "P2-2026-PartB-Q1", sectionId: "candidate-02",
    }) }));
    const second = runFreeze({ fixturesDir: dir, outDir, now: () => "2026-08-17T01:00:00.000Z" });
    expect(second.ok).toBe(false);
    expect(second.reasons.join(" ")).toContain("fingerprint mismatch");
  });

  it("TEST-CAL-054: malformed evidence blocks freeze", () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "broken.json"), "{ not valid json", "utf-8");
    expect(() => runFreeze({ fixturesDir: dir, outDir: tmpDir() }))
      .toThrow(FreezeBlockedError);
  });

  it("TEST-CAL-055: valid verified dataset freezes", () => {
    const dir = tmpDir();
    writeFixture(dir, verifiedFixture());
    const result = runFreeze({ fixturesDir: dir, outDir: tmpDir(), now: () => "2026-08-17T00:00:00.000Z" });
    expect(result.ok).toBe(true);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.verifiedComparableCount).toBe(1);
  });

  it("TEST-CAL-056: frozen manifest reproduces the fingerprint", () => {
    const dir = tmpDir();
    writeFixture(dir, verifiedFixture());
    const outDir = tmpDir();
    const result = runFreeze({ fixturesDir: dir, outDir, now: () => "2026-08-17T00:00:00.000Z" });
    writeFreezeOutput(result, outDir);
    const manifest = JSON.parse(readFileSync(join(outDir, "frozen-manifest.json"), "utf-8"));
    expect(manifest.fingerprint).toBe(result.fingerprint);
    expect(existsSync(join(outDir, "frozen-inventory.json"))).toBe(true);
  });

  it("TEST-CAL-057: freeze is deterministic", () => {
    const dir = tmpDir();
    writeFixture(dir, verifiedFixture());
    const outDir = tmpDir();
    const a = runFreeze({ fixturesDir: dir, outDir, now: () => "2026-08-17T00:00:00.000Z" });
    const b = runFreeze({ fixturesDir: dir, outDir, now: () => "2026-08-17T00:00:00.000Z" });
    expect(JSON.stringify(a.manifest)).toBe(JSON.stringify(b.manifest));
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("TEST-CAL-058: freeze never mutates fixture scores", () => {
    const dir = tmpDir();
    const fixture = verifiedFixture();
    writeFixture(dir, fixture);
    const before = readFileSync(join(dir, `${fixture.id}.json`), "utf-8");
    const result = runFreeze({ fixturesDir: dir, outDir: tmpDir(), now: () => "2026-08-17T00:00:00.000Z" });
    expect(result.ok).toBe(true);
    const after = readFileSync(join(dir, `${fixture.id}.json`), "utf-8");
    expect(after).toBe(before);
  });

  it("TEST-CAL-059: frozen dataset loads in the calibration runner", async () => {
    const dir = tmpDir();
    writeFixture(dir, verifiedFixture());
    const frozen = runFreeze({ fixturesDir: dir, outDir: tmpDir(), now: () => "2026-08-17T00:00:00.000Z" });
    expect(frozen.ok).toBe(true);
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [verifiedFixture()],
      analyzer: async () => ({
        overallScore: 86, contentScore: 5, languageScore: 5, organizationScore: 5,
        cloTotalScore: 18, dseLevel: "4", platformWritingEstimate: "4",
        strengths: [], weaknesses: [], grammarErrors: [], chinglishWarnings: [],
        vocabularySuggestions: [], structureFeedback: "x", generalComment: "x",
      }),
    });
    // 1 sample < policy minimums → INSUFFICIENT_DATA (honest, no PASS).
    expect(report.gate.decision).toBe("INSUFFICIENT_DATA");
  });
});
