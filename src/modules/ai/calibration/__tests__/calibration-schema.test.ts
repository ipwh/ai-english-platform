// ============================================
// R3.10-F: Calibration Schema Tests
//
// Covers Phase 8 items:
//   1. official fixture schema
//   2. synthetic fixture remains synthetic
//   3. HKEAA fixture requires provenance
//   4. no fabricated criterion scores
//   15. provenance survives serialization
// ============================================

import { describe, it, expect } from "vitest";
import {
  classifyFixtureKind,
  validateAuthoritativeFixture,
  computeProvenanceHash,
} from "../provenance";
import type { AuthoritativeCalibrationFixture } from "../types";

function makeFixture(
  overrides: Partial<AuthoritativeCalibrationFixture> = {},
): AuthoritativeCalibrationFixture {
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
      sourceFile: "materials/_extracted/paper2.txt",
      sourceHash: computeProvenanceHash(["test-source"]),
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
    ...overrides,
  };
}

describe("Calibration schema — fixture category discrimination", () => {
  it("classifies an HKEAA-provenanced fixture as authoritative-calibration", () => {
    expect(classifyFixtureKind(makeFixture())).toBe("authoritative-calibration");
  });

  it("keeps synthetic fixtures synthetic (no provenance → synthetic-regression)", () => {
    const synthetic = {
      id: "sample-01",
      task: "task",
      studentDraft: "draft",
      expected: { contentScore: 5, languageScore: 5, organizationScore: 5 },
      metadata: { source: "platform-generated" },
    };
    expect(classifyFixtureKind(synthetic)).toBe("synthetic-regression");
  });

  it("does NOT let a synthetic fixture silently become authoritative via scores", () => {
    const syntheticWithScores = {
      id: "cal-01",
      task: "task",
      studentDraft: "draft",
      expected: { contentScore: 7, languageScore: 7, organizationScore: 7 },
      calibrationStatus: "teacher-reviewed",
      metadata: { markerCount: 3 },
    };
    expect(classifyFixtureKind(syntheticWithScores)).toBe("synthetic-regression");
  });

  it("rejects authority claims from any organization other than HKEAA", () => {
    const impostor = makeFixture();
    (impostor.provenance as { sourceOrganization: unknown }).sourceOrganization = "school-x";
    expect(classifyFixtureKind(impostor)).toBe("synthetic-regression");
  });
});

describe("Calibration schema — provenance required", () => {
  it("rejects an authoritative fixture without provenance", () => {
    const missing = makeFixture();
    (missing as { provenance?: unknown }).provenance = undefined;
    const result = validateAuthoritativeFixture(missing as unknown as AuthoritativeCalibrationFixture);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("provenance is required");
  });

  it("rejects missing sourceDocument", () => {
    const f = makeFixture();
    f.provenance = { ...f.provenance, sourceDocument: "" };
    const result = validateAuthoritativeFixture(f);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("sourceDocument");
  });

  it("rejects a non-sha256 sourceHash", () => {
    const f = makeFixture();
    f.provenance = { ...f.provenance, sourceHash: "not-a-hash" };
    const result = validateAuthoritativeFixture(f);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("sourceHash");
  });

  it("rejects an implausible sourceYear", () => {
    const f = makeFixture();
    f.provenance = { ...f.provenance, sourceYear: 1850 };
    const result = validateAuthoritativeFixture(f);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("sourceYear");
  });

  it("accepts a fully valid level-only fixture", () => {
    const result = validateAuthoritativeFixture(makeFixture());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("Calibration schema — no fabricated criterion scores", () => {
  it("rejects criterion scores when criterionScoresOfficiallyPublished is false", () => {
    const f = makeFixture({
      criterionScoresOfficiallyPublished: false,
      publishedContentScore: 6,
      publishedLanguageScore: 5,
      publishedOrganizationScore: 6,
    });
    const result = validateAuthoritativeFixture(f);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("criterion scores");
  });

  it("rejects ANY non-null criterion score on an unofficial source", () => {
    const f = makeFixture({
      criterionScoresOfficiallyPublished: false,
      publishedLanguageScore: 7,
    });
    const result = validateAuthoritativeFixture(f);
    expect(result.ok).toBe(false);
  });

  it("accepts criterion scores ONLY when officially published", () => {
    const f = makeFixture({
      criterionScoresOfficiallyPublished: true,
      publishedContentScore: 6,
      publishedLanguageScore: 5,
      publishedOrganizationScore: 6,
    });
    const result = validateAuthoritativeFixture(f);
    expect(result.ok).toBe(true);
  });

  it("rejects non-finite published scores", () => {
    const f = makeFixture({
      criterionScoresOfficiallyPublished: true,
      publishedOverallScore: Number.NaN,
    });
    const result = validateAuthoritativeFixture(f);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("publishedOverallScore");
  });
});

describe("Calibration schema — status semantics", () => {
  it("rejects status 'ingested' without script text", () => {
    const result = validateAuthoritativeFixture(
      makeFixture({ calibrationStatus: "ingested" }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("studentScript");
  });

  it("rejects status 'ingested' without any published value", () => {
    const result = validateAuthoritativeFixture(
      makeFixture({
        calibrationStatus: "ingested",
        studentScript: "I think...",
        publishedLevel: null,
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a runnable fixture with script and published level", () => {
    const result = validateAuthoritativeFixture(
      makeFixture({
        calibrationStatus: "ingested",
        studentScript: "I think schools should...",
        provenance: {
          ...makeFixture().provenance,
          extractionStatus: "complete-script-text",
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects script text conflicting with script-not-in-extraction", () => {
    const result = validateAuthoritativeFixture(
      makeFixture({
        studentScript: "unexpected text",
      }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("Calibration schema — provenance survives serialization", () => {
  it("round-trips JSON without losing provenance fields", () => {
    const f = makeFixture();
    const json = JSON.stringify(f, null, 2);
    const back = JSON.parse(json) as AuthoritativeCalibrationFixture;

    expect(back.provenance.sourceOrganization).toBe("hkeaa");
    expect(back.provenance.sourceDocument).toBe(f.provenance.sourceDocument);
    expect(back.provenance.sourceYear).toBe(2024);
    expect(back.provenance.sourceHash).toBe(f.provenance.sourceHash);
    expect(back.provenance.taskId).toBe("P2-2024-PartB-Q2");
    expect(back.publishedLevel).toBe(5);
    expect(validateAuthoritativeFixture(back).ok).toBe(true);
    expect(JSON.stringify(back)).toBe(JSON.stringify(f));
  });

  it("hash is deterministic for identical canonical parts", () => {
    const a = computeProvenanceHash(["doc", "P2", "2024"]);
    const b = computeProvenanceHash(["doc", "P2", "2024"]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
