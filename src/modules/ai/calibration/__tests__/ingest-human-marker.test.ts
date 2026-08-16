// ============================================
// R3.10-G: Human-Marker Ingestion — Adversarial Tests
//
// Evidence-driven tests against the REAL owner-supplied sources in
// materials/_hkeaa_scored_scripts plus contract-level attacks.
// All synthetic fixtures remain clearly labelled and never enter
// authoritative datasets.
// ============================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ingestHumanMarkerSources,
  extractStudentScript,
  sha256OfBytes,
} from "../ingestion/ingest-human-marker";
import {
  classifyHumanMarkerSource,
  validateHumanMarkerEvidenceSet,
  validateHumanMarkerFixture,
} from "../human-marker";
import { runHumanMarkerCalibrationBenchmark } from "../runner";
import type { CalibrationAnalyzer } from "../runner";
import type { HumanMarkerCalibrationFixture } from "../types";

const ROOT = resolve(__dirname, "..", "..", "..", "..", "..");
const SOURCES_DIR = join(ROOT, "materials", "_hkeaa_scored_scripts");
const FIXTURES_DIR = join(__dirname, "..", "fixtures", "human-marker");

function perfectAnalyzer(): CalibrationAnalyzer {
  return async () => ({
    overallScore: 68,
    contentScore: 7,
    languageScore: 7,
    organizationScore: 7,
    cloTotalScore: 21,
    dseLevel: "5",
    platformWritingEstimate: "5",
    strengths: [],
    weaknesses: [],
    grammarErrors: [],
    chinglishWarnings: [],
    vocabularySuggestions: [],
    structureFeedback: "x",
    generalComment: "x",
  });
}

describe("R3.10-G — real source ingestion", () => {
  const result = ingestHumanMarkerSources({ sourcesDir: SOURCES_DIR });

  it("ingests exactly 3 human-marker fixtures from the 2018 source", () => {
    expect(result.fixtures).toHaveLength(3);
  });

  it("preserves published levels EXACTLY as published (5**)", () => {
    for (const fixture of result.fixtures) {
      expect(fixture.publishedLevel).toBe("5**");
      expect(fixture.overallScore).toBeNull();
    }
  });

  it("preserves published criterion scores exactly (C7 L7 O7)", () => {
    const q9 = result.fixtures.find(f => f.provenance.sourceYear === 2012);
    const q4 = result.fixtures.find(f => f.provenance.sourceYear === 2016);
    expect(q9?.contentScore).toBe(7);
    expect(q9?.languageScore).toBe(7);
    expect(q9?.organizationScore).toBe(7);
    expect(q4?.contentScore).toBe(7);
    expect(q4?.scoreProvenance.criterionScoresDirectlyScored).toBe(true);
    // No overall invented from criteria
    expect(q9?.overallScore).toBeNull();
  });

  it("preserves M1/M2 sub-marks verbatim and never derives a comparable overall", () => {
    const q5 = result.fixtures.find(f => f.provenance.sourceYear === 2018);
    expect(q5?.publishedSubScores).toEqual([
      { label: "M1", value: 21 },
      { label: "M2", value: 19 },
      { label: "total", value: "40/42" },
    ]);
    expect(q5?.overallScore).toBeNull();
    expect(q5?.contentScore).toBeNull();
    expect(q5?.scoreProvenance.overallScoreDirectlyScored).toBe(false);
  });

  it("carries the owner authority assertion as provenance metadata", () => {
    for (const fixture of result.fixtures) {
      expect(fixture.provenance.sourceAuthorityAssertion).toEqual({
        assertedBy: "repository-owner",
        authority: "HKEAA",
        acquisitionMethod: "direct-source",
        // Phase 7: third-party-hosted source — verification required, unverified
        verificationRequired: true,
        verificationStatus: "unverified",
      });
    }
  });

  it("records the SHA-256 of the exact source artifact", () => {
    for (const fixture of result.fixtures) {
      expect(fixture.provenance.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      const pdfPath = join(SOURCES_DIR, fixture.provenance.sourceDocument);
      expect(sha256OfBytes(readFileSync(pdfPath))).toBe(fixture.provenance.sourceHash);
    }
  });

  it("preserves extraction provenance (native-text, quality unknown — no verbatim claim)", () => {
    for (const fixture of result.fixtures) {
      expect(fixture.provenance.extractionMethod).toBe("native-text");
      expect(fixture.provenance.extractionQuality).toBe("unknown");
    }
  });

  it("keeps task-level provenance: year / paper / part / question / topic", () => {
    const byYear = result.fixtures.map(f => f.provenance.sourceYear).sort();
    expect(byYear).toEqual([2012, 2016, 2018]);
    for (const fixture of result.fixtures) {
      expect(fixture.provenance.paper).toBe("Paper 2");
      expect(fixture.provenance.taskId).toMatch(/^P2-\d{4}-PartB-Q\d+$/);
      expect(fixture.provenance.sectionId).toMatch(/^PartB Q\d+$/);
      expect(fixture.provenance.sourcePageRange).toBeDefined();
    }
  });

  it("does NOT merge scripts from different tasks into one sample", () => {
    const taskIds = new Set(result.fixtures.map(f => f.provenance.taskId));
    expect(taskIds.size).toBe(3);
  });

  it("classifies the 2019 image-only scan as non-authoritative with 0 fixtures", () => {
    const entry = result.manifest.find(m => m.sourceFilename.includes("2019"));
    expect(entry?.sourceClass).toBe("non-authoritative-reference");
    expect(entry?.fixtureCount).toBe(0);
    expect(entry?.extractionMethod).toBe("image-only-no-text-layer");
  });

  it("classifies the sample-essay PDF as teaching-reference with 0 fixtures", () => {
    const entry = result.manifest.find(m => m.sourceFilename.includes("Sample Essay"));
    expect(entry?.sourceClass).toBe("teaching-reference");
    expect(entry?.fixtureCount).toBe(0);
  });

  it("ingestion is deterministic and idempotent", () => {
    const a = ingestHumanMarkerSources({ sourcesDir: SOURCES_DIR });
    const b = ingestHumanMarkerSources({ sourcesDir: SOURCES_DIR });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("checked-in fixture files match the ingestion output (immutable artifacts)", () => {
    const files = readdirSync(FIXTURES_DIR)
      .filter(f => f.startsWith("hm-") && f.endsWith(".json"))
      .sort();
    expect(files).toHaveLength(3);
    for (const file of files) {
      const onDisk = JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf-8"));
      const fresh = result.fixtures.find(f => `${f.id}.json` === file);
      expect(fresh).toBeDefined();
      expect(JSON.stringify(onDisk)).toBe(JSON.stringify(fresh));
    }
  });

  it("the extracted script is preserved verbatim (no spelling/OCR normalization)", () => {
    const q5 = result.fixtures.find(f => f.provenance.sourceYear === 2018);
    expect(q5?.studentScript).toContain("prov oked"); // source artifact, untouched
    expect(q5?.studentScript).toContain("Chairman, ladies and gentlemen");
  });
});

describe("R3.10-G — sub-score semantics (no inference)", () => {
  function makeFixture(): HumanMarkerCalibrationFixture {
    return ingestHumanMarkerSources({ sourcesDir: SOURCES_DIR })
      .fixtures.find(f => f.provenance.sourceYear === 2018) as HumanMarkerCalibrationFixture;
  }

  it("sub-scores never enter metric comparison (overall/criterion stay n=0)", async () => {
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [makeFixture()],
      analyzer: perfectAnalyzer(),
    });
    expect(report.metrics.overall.n).toBe(0);
    expect(report.metrics.perCriterion.content.n).toBe(0);
    // level agreement still measured: published 5** vs predicted 5 → mismatch
    expect(report.comparisons[0].levelExactMatch).toBe(false);
  });

  it("level 5** is never converted into any numeric score", () => {
    const fixture = makeFixture();
    expect(fixture.publishedLevel).toBe("5**");
    expect(fixture.overallScore).toBeNull();
    expect(fixture.contentScore).toBeNull();
  });
});

describe("R3.10-G — source classification rules", () => {
  it("teaching compilations never become calibration evidence by default", () => {
    const c = classifyHumanMarkerSource({
      hasScriptText: true,
      hasPublishedScore: true,
      hasPublishedLevel: true,
      hasTaskProvenance: true,
      isTeachingCompilation: true,
      isRubricDocument: false,
    });
    expect(c.sourceClass).toBe("teaching-reference");
  });

  it("image-only scans without script text are non-authoritative", () => {
    const c = classifyHumanMarkerSource({
      hasScriptText: false,
      hasPublishedScore: true,
      hasPublishedLevel: true,
      hasTaskProvenance: true,
      isTeachingCompilation: false,
      isRubricDocument: false,
    });
    expect(c.sourceClass).toBe("non-authoritative-reference");
    expect(c.reasons.join(" ")).toContain("no extractable script text");
  });

  it("authority is never inferred from filename — only content facts matter", () => {
    const scored = classifyHumanMarkerSource({
      hasScriptText: true,
      hasPublishedScore: false,
      hasPublishedLevel: true,
      hasTaskProvenance: true,
      isTeachingCompilation: false,
      isRubricDocument: false,
    });
    expect(scored.sourceClass).toBe("human-marker-scored");
  });

  it("rubric documents are detected by heading-level signals, never prose mentions", () => {
    // isRubricDocument is only ever set by heading-level detection in
    // detectFacts; when set, the document is a rubric reference.
    const rubric = classifyHumanMarkerSource({
      hasScriptText: false,
      hasPublishedScore: false,
      hasPublishedLevel: false,
      hasTaskProvenance: false,
      isTeachingCompilation: false,
      isRubricDocument: true,
    });
    expect(rubric.sourceClass).toBe("official-rubric-reference");

    // A scored-scripts document discussing "marking schemes" in prose
    // (isRubricDocument false) stays human-marker-scored.
    const scored = classifyHumanMarkerSource({
      hasScriptText: true,
      hasPublishedScore: true,
      hasPublishedLevel: true,
      hasTaskProvenance: true,
      isTeachingCompilation: false,
      isRubricDocument: false,
    });
    expect(scored.sourceClass).toBe("human-marker-scored");
  });
});

describe("R3.10-G — authority assertion is metadata, not a bypass", () => {
  function fixtureFromSource(): HumanMarkerCalibrationFixture {
    return ingestHumanMarkerSources({ sourcesDir: SOURCES_DIR })
      .fixtures.find(f => f.provenance.sourceYear === 2012) as HumanMarkerCalibrationFixture;
  }

  it("a valid authority assertion does not excuse missing marker provenance", () => {
    const fixture = fixtureFromSource();
    const stripped = {
      ...fixture,
      scoreProvenance: { ...fixture.scoreProvenance, suppliedBy: "unknown" as never },
    };
    const result = validateHumanMarkerFixture(stripped);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("suppliedBy");
  });

  it("a valid authority assertion does not excuse an altered source hash", () => {
    const fixture = fixtureFromSource();
    const tampered = {
      ...fixture,
      provenance: { ...fixture.provenance, sourceHash: "f".repeat(64) },
    };
    expect(validateHumanMarkerFixture(tampered).ok).toBe(true); // well-formed
    // But the set check against the genuine fixture detects the conflict.
    const setResult = validateHumanMarkerEvidenceSet([fixture, tampered]);
    expect(setResult.ok).toBe(false);
    expect(setResult.conflicts).toHaveLength(1);
  });

  it("missing sourceAuthorityAssertion fails validation", () => {
    const fixture = fixtureFromSource();
    const noAssertion = {
      ...fixture,
      provenance: {
        ...fixture.provenance,
        sourceAuthorityAssertion: undefined as unknown as typeof fixture.provenance.sourceAuthorityAssertion,
      },
    };
    const result = validateHumanMarkerFixture(noAssertion);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("sourceAuthorityAssertion");
  });

  it("extraction metadata survives serialization round-trip", () => {
    const fixture = fixtureFromSource();
    const back = JSON.parse(JSON.stringify(fixture)) as HumanMarkerCalibrationFixture;
    expect(back.provenance.extractionMethod).toBe("native-text");
    expect(back.provenance.extractionQuality).toBe("unknown");
    expect(back.provenance.sourceAuthorityAssertion.assertedBy).toBe("repository-owner");
    expect(validateHumanMarkerFixture(back).ok).toBe(true);
  });
});

describe("R3.10-G — extracted script hygiene", () => {
  it("drops the Q prompt and teaching annotation blocks, keeps prose verbatim", () => {
    const text = [
      "Lv 5**       C:7  L:7  O:7",
      "2012 DSE Q9",
      "Q: Your school magazine is going to include a special feature",
      "<1> about your friend's depression",
      "3 THINGS TO INCLUDE IN YOUR ESSAY:",
      "-why did your friend suffer from depression?",
      "--- Page 7 ---",
      "Face it Bravely! -- The Key to Fighting Depression",
      "There is only one thing more staggering than Hong Kong's",
    ].join("\n");
    const script = extractStudentScript(text);
    expect(script).toContain("Face it Bravely!");
    expect(script).toContain("more staggering");
    expect(script).not.toContain("3 THINGS");
    expect(script).not.toContain("Your school magazine");
    expect(script).not.toContain("--- Page 7 ---");
  });
});
