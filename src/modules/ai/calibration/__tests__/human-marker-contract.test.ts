// ============================================
// R3.10-F: Human-Marker Evidence Contract — Adversarial Tests
//
// Every fixture built here is CLEARLY LABELLED synthetic test data
// (sourceOrganization "test-school", notes prefixed TEST-ONLY).
// No fake human-marker data may ever be ingested as real evidence;
// these objects exist purely to attack the validation contract.
// ============================================

import { describe, it, expect } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildHumanMarkerFixtureId,
  validateHumanMarkerFixture,
  validateHumanMarkerEvidenceSet,
  humanMarkerEvidenceKey,
} from "../human-marker";
import { classifyFixtureKind, computeProvenanceHash } from "../provenance";
import { validateAuthoritativeFixture } from "../provenance";
import { loadAuthoritativeFixtures } from "../runner";
import type {
  AuthoritativeCalibrationFixture,
  HumanMarkerCalibrationFixture,
} from "../types";

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
    notes: "TEST-ONLY synthetic fixture — never ingested as real evidence",
    ...overrides,
  };
}

function makeLevelOnlyAuthoritative(): AuthoritativeCalibrationFixture {
  return {
    kind: "authoritative-calibration",
    id: "hkeaa-p2-2024-level5-exemplar1",
    schemaVersion: 1,
    provenance: {
      sourceOrganization: "hkeaa",
      sourceDocument: "Paper 2 Samples_HKDSE English 2020-2025.pdf",
      sourceYear: 2024,
      paper: "Paper 2",
      taskId: "P2-2024-PartB-Q2",
      sectionId: "Level 5 exemplar 1",
      sourceFile: "materials/_extracted/x.txt",
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
}

describe("Human-marker contract — valid shape", () => {
  it("accepts a fully valid, clearly-labelled synthetic fixture", () => {
    const result = validateHumanMarkerFixture(makeHumanFixture());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("classifies explicit human-marker fixtures into their own category", () => {
    expect(classifyFixtureKind(makeHumanFixture())).toBe("human-marker-calibration");
  });

  it("preserves category across serialization/deserialization", () => {
    const fixture = makeHumanFixture();
    const back = JSON.parse(JSON.stringify(fixture)) as unknown;
    expect(classifyFixtureKind(back)).toBe("human-marker-calibration");
    expect(validateHumanMarkerFixture(back as HumanMarkerCalibrationFixture).ok)
      .toBe(true);
  });
});

describe("Human-marker contract — adversarial rejections", () => {
  it("rejects evidence with missing script text (never downgraded)", () => {
    const result = validateHumanMarkerFixture(
      makeHumanFixture({ studentScript: "   " }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("studentScript is REQUIRED");
  });

  it("rejects overall score without marker provenance", () => {
    const result = validateHumanMarkerFixture(
      makeHumanFixture({
        scoreProvenance: {
          ...makeHumanFixture().scoreProvenance,
          suppliedBy: "platform-estimate" as never,
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("suppliedBy");
  });

  it("rejects overall score that is not directly scored (inferred total)", () => {
    const result = validateHumanMarkerFixture(
      makeHumanFixture({
        scoreProvenance: {
          ...makeHumanFixture().scoreProvenance,
          overallScoreDirectlyScored: false,
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("overallScoreDirectlyScored");
  });

  it("rejects criterion scores inferred from a total (not directly scored)", () => {
    const result = validateHumanMarkerFixture(
      makeHumanFixture({
        overallScore: 15,
        contentScore: 5,
        languageScore: 5,
        organizationScore: 5,
        scoreProvenance: {
          ...makeHumanFixture().scoreProvenance,
          criterionScoresDirectlyScored: false,
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("criterionScoresDirectlyScored");
  });

  it("rejects an overall score without a declared scale (unsafe comparison)", () => {
    const result = validateHumanMarkerFixture(
      makeHumanFixture({
        scoreProvenance: {
          ...makeHumanFixture().scoreProvenance,
          overallScoreBasis: null,
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("overallScoreBasis");
  });

  it("rejects criterion scores without the declared CLO scale", () => {
    const result = validateHumanMarkerFixture(
      makeHumanFixture({
        scoreProvenance: {
          ...makeHumanFixture().scoreProvenance,
          criterionScoreBasis: null,
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("criterionScoreBasis");
  });

  it("rejects an overall score whose marker provenance is absent", () => {
    const fixture = makeHumanFixture() as Partial<HumanMarkerCalibrationFixture>;
    delete (fixture as { scoreProvenance?: unknown }).scoreProvenance;
    const result = validateHumanMarkerFixture(
      fixture as unknown as HumanMarkerCalibrationFixture,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("suppliedBy");
  });

  it("rejects a level masquerading as scored evidence (level cannot generate scores)", () => {
    const result = validateHumanMarkerFixture(
      makeHumanFixture({
        publishedLevel: "4",
        overallScore: null,
        contentScore: null,
        languageScore: null,
        organizationScore: null,
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("level-only");
  });

  it("rejects an altered source hash", () => {
    const result = validateHumanMarkerFixture(
      makeHumanFixture({
        provenance: { ...makeHumanFixture().provenance, sourceHash: "b".repeat(64) },
      }),
    );
    // An altered hash alone is well-formed — but the evidence-set check
    // must treat hash mismatch against the SAME evidence identity as a
    // conflict, not a silent replacement.
    const setResult = validateHumanMarkerEvidenceSet([
      makeHumanFixture(),
      makeHumanFixture({
        provenance: { ...makeHumanFixture().provenance, sourceHash: "b".repeat(64) },
      }),
    ]);
    expect(result.ok).toBe(true); // hash format is valid; conflict is detected at set level
    expect(setResult.ok).toBe(false);
    expect(setResult.conflicts.length).toBe(1);
  });

  it("rejects a malformed source hash", () => {
    const result = validateHumanMarkerFixture(
      makeHumanFixture({
        provenance: { ...makeHumanFixture().provenance, sourceHash: "not-a-hash" },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("sourceHash");
  });

  it("rejects malformed marker metadata (empty marker id / policy)", () => {
    const noId = validateHumanMarkerFixture(makeHumanFixture({ markerId: "" }));
    expect(noId.ok).toBe(false);
    expect(noId.errors.join(" ")).toContain("markerId");

    const noPolicy = validateHumanMarkerFixture(makeHumanFixture({ markerPolicy: "  " }));
    expect(noPolicy.ok).toBe(false);
    expect(noPolicy.errors.join(" ")).toContain("markerPolicy");
  });

  it("rejects missing provenance entirely", () => {
    const missing = makeHumanFixture() as Partial<HumanMarkerCalibrationFixture>;
    delete (missing as { provenance?: unknown }).provenance;
    const result = validateHumanMarkerFixture(
      missing as unknown as HumanMarkerCalibrationFixture,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("provenance is required");
  });

  it("rejects non-finite numeric scores", () => {
    const result = validateHumanMarkerFixture(
      makeHumanFixture({ overallScore: Number.NaN }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("overallScore");
  });
});

describe("Human-marker contract — HKEAA boundary preserved", () => {
  it("level-only HKEAA fixture with an invented numeric score stays invalid", () => {
    const fixture = makeLevelOnlyAuthoritative();
    fixture.publishedContentScore = 6;
    const result = validateAuthoritativeFixture(fixture);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("criterion scores");
  });

  it("a scored fixture cannot silently downgrade to authoritative level-only", () => {
    const downgraded = {
      ...makeHumanFixture(),
      kind: "authoritative-calibration" as const,
      provenance: {
        sourceOrganization: "hkeaa" as const,
        sourceDocument: "x.pdf",
        sourceYear: 2024,
        paper: "Paper 2" as const,
        taskId: "P2-2024-PartB-Q2",
        sectionId: "Level 5 exemplar 1",
        sourceFile: "x.txt",
        sourceHash: TEST_HASH,
        extractionStatus: "complete-script-text" as const,
      },
      studentScript: makeHumanFixture().studentScript,
      publishedOverallScore: 15,
      publishedContentScore: 5,
      criterionScoresOfficiallyPublished: false,
    } as unknown as AuthoritativeCalibrationFixture;
    const result = validateAuthoritativeFixture(downgraded);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("criterion scores");
  });

  it("a synthetic fixture cannot masquerade as authoritative through extra scores", () => {
    const masquerade = {
      id: "cal-01",
      task: "task",
      studentDraft: "draft",
      expected: { contentScore: 7, languageScore: 7, organizationScore: 7 },
      metadata: { markerCount: 3 },
    };
    expect(classifyFixtureKind(masquerade)).toBe("synthetic-regression");
  });

  it("human-marker fixtures placed in the HKEAA fixture directory fail closed", () => {
    const dir = join(tmpdir(), `hm-audit-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        join(dir, "hm-test.json"),
        JSON.stringify(makeHumanFixture(), null, 2),
        "utf-8",
      );
      expect(() => loadAuthoritativeFixtures(dir)).toThrow(
        /not an authoritative calibration fixture/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Human-marker contract — evidence-set checks", () => {
  it("detects duplicate evidence with identical content (idempotent)", () => {
    const a = makeHumanFixture();
    const b = makeHumanFixture();
    const result = validateHumanMarkerEvidenceSet([a, b]);
    expect(result.duplicates).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it("hard-fails duplicate evidence with conflicting scores", () => {
    const a = makeHumanFixture({ overallScore: 15 });
    const b = makeHumanFixture({ overallScore: 11 });
    const result = validateHumanMarkerEvidenceSet([a, b]);
    expect(result.ok).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.errors.join(" ")).toContain("conflicting evidence");
  });

  it("hard-fails duplicate evidence with conflicting marker policies", () => {
    const a = makeHumanFixture({ markerPolicy: "single marking" });
    const b = makeHumanFixture({ markerPolicy: "double marking, moderated" });
    const result = validateHumanMarkerEvidenceSet([a, b]);
    expect(result.ok).toBe(false);
    expect(result.conflicts).toHaveLength(1);
  });

  it("fails the whole set when any member is invalid (no silent skipping)", () => {
    const result = validateHumanMarkerEvidenceSet([
      makeHumanFixture(),
      makeHumanFixture({ markerId: "" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("markerId");
  });
});

describe("Human-marker contract — deterministic ids", () => {
  it("produces the same id for the same evidence", () => {
    const input = { year: 2024, paper: "Paper 2" as const, taskId: "P2-2024-PartB-Q2", sectionId: "Class 5A candidate 07" };
    expect(buildHumanMarkerFixtureId(input)).toBe(buildHumanMarkerFixtureId(input));
  });

  it("produces distinct ids for distinct evidence", () => {
    const base = { year: 2024, paper: "Paper 2" as const, taskId: "P2-2024-PartB-Q2", sectionId: "Class 5A candidate 07" };
    const other = { ...base, sectionId: "Class 5A candidate 08" };
    expect(buildHumanMarkerFixtureId(base)).not.toBe(buildHumanMarkerFixtureId(other));
  });

  it("ids are slug-safe (lowercase, no whitespace)", () => {
    const id = buildHumanMarkerFixtureId({
      year: 2024,
      paper: "Paper 2",
      taskId: "P2 2024 / PartB Q2",
      sectionId: "Class 5A — candidate 07",
    });
    expect(id).toMatch(/^hm-\d+-p\d+-[a-z0-9-]+$/);
    expect(id).not.toMatch(/[A-Z\s/]/);
  });

  it("evidence keys are stable for duplicate detection", () => {
    const a = makeHumanFixture();
    const b = makeHumanFixture({ markerId: "marker-anon-99" });
    expect(humanMarkerEvidenceKey(a)).toBe(humanMarkerEvidenceKey(b));
  });
});
