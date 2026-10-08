// ============================================
// R3.10-H: Overall-Score Evidence Expansion — Adversarial Tests
//
// Covers the 20 required rules. Real fixtures come from the
// ingested owner sources; synthetic sections are clearly labelled
// TEST-ONLY and never persisted as evidence.
// ============================================

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  parseOverallScore,
  ingestHumanMarkerSources,
  buildEvidenceInventory,
  sha256OfBytes,
} from "../ingestion/ingest-human-marker";
import {
  classifyHumanMarkerEvidence,
  classifyHumanMarkerSource,
  validateHumanMarkerFixture,
  validateHumanMarkerEvidenceSet,
} from "../human-marker";
import { classifyFixtureKind } from "../provenance";
import { runHumanMarkerCalibrationBenchmark } from "../runner";
import type { HumanMarkerCalibrationFixture } from "../types";
import { HAS_SCORED_SCRIPTS } from "./corpus-availability";

const ROOT = resolve(__dirname, "..", "..", "..", "..", "..");
const SOURCES_DIR = join(ROOT, "materials", "_hkeaa_scored_scripts");

// Tests that read the owner-supplied corpus are skipped when it is absent (CI) — it is not
// committed; see ./corpus-availability.ts. Every case that uses `real()` / `realFixture()`
// is gated individually so the synthetic contracts keep running everywhere.

const real = () => ingestHumanMarkerSources({ sourcesDir: SOURCES_DIR });

function realFixture(year: number): HumanMarkerCalibrationFixture {
  return real().fixtures.find(f => f.provenance.sourceYear === year) as HumanMarkerCalibrationFixture;
}

// ── Score parsing: explicit scale establishment (items 1, 2, 6, 7, 8) ──

describe("R3.10-H — explicit overall-score parsing", () => {
  it("accepts an explicit overall 18/21 as clo-total-0-21", () => {
    expect(parseOverallScore("Lv5**  Overall: 18/21")).toEqual({
      numerator: 18, denominator: 21, basis: "clo-total-0-21",
    });
    expect(parseOverallScore("Lv5**  Total: 18/21")).toEqual({
      numerator: 18, denominator: 21, basis: "clo-total-0-21",
    });
  });

  it("accepts an explicit overall 82/100 as percentage-0-100", () => {
    expect(parseOverallScore("Lv4  Score: 82/100")).toEqual({
      numerator: 82, denominator: 100, basis: "percentage-0-100",
    });
  });

  it("rejects an overall number without an established scale (e.g. 40/42)", () => {
    const parsed = parseOverallScore("Lv5**  Overall: 40/42");
    expect(parsed).toEqual({ numerator: 40, denominator: 42, basis: null });
  });

  it("rejects a labelled overall with no denominator (corrupt → quarantine)", () => {
    expect(parseOverallScore("Lv4  Overall: 18")).toBe("corrupt");
  });

  it("rejects an OCR-corrupted score expression", () => {
    expect(parseOverallScore("Lv4  Overall: 1 8/21")).toBe("corrupt");
    expect(parseOverallScore("Lv4  Overall: 18/2 1")).toBe("corrupt");
  });

  it("rejects bare numbers near essays (no label → never a score)", () => {
    expect(parseOverallScore("Lv4  18/21")).toBeNull();
    expect(parseOverallScore("students scored well overall 18/21")).toBeNull();
  });
});

// ── Evidence classification taxonomy (items 3, 4, 5, 13, 14) ──

describe("R3.10-H — evidence classification", () => {
  it.skipIf(!HAS_SCORED_SCRIPTS)("classifies the ingested M1/M2 script as NON_COMPARABLE_SCORE", () => {
    expect(classifyHumanMarkerEvidence(realFixture(2018)))
      .toBe("NON_COMPARABLE_SCORE");
  });

  it.skipIf(!HAS_SCORED_SCRIPTS)("classifies the ingested C/L/O scripts as ACCEPT_CRITERION_ONLY", () => {
    expect(classifyHumanMarkerEvidence(realFixture(2012)))
      .toBe("ACCEPT_CRITERION_ONLY");
    expect(classifyHumanMarkerEvidence(realFixture(2016)))
      .toBe("ACCEPT_CRITERION_ONLY");
  });

  it.skipIf(!HAS_SCORED_SCRIPTS)("classifies level-only evidence as LEVEL_ONLY (never a score)", () => {
    const levelOnly = {
      ...realFixture(2012),
      contentScore: null,
      languageScore: null,
      organizationScore: null,
      overallScore: null,
      publishedSubScores: undefined,
    };
    expect(classifyHumanMarkerEvidence(levelOnly)).toBe("LEVEL_ONLY");
    expect(levelOnly.overallScore).toBeNull();
  });

  it.skipIf(!HAS_SCORED_SCRIPTS)("classifies overall-scored evidence as ACCEPT_OVERALL_SCORE", () => {
    const overall = {
      ...realFixture(2012),
      contentScore: null,
      languageScore: null,
      organizationScore: null,
      overallScore: 18,
      publishedSubScores: undefined,
      scoreProvenance: {
        ...realFixture(2012).scoreProvenance,
        overallScoreBasis: "clo-total-0-21" as const,
        criterionScoreBasis: null,
        criterionScoresDirectlyScored: false,
        overallScoreDirectlyScored: true,
      },
    };
    expect(classifyHumanMarkerEvidence(overall)).toBe("ACCEPT_OVERALL_SCORE");
  });

  it("teaching material never becomes calibration evidence", () => {
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

  it("synthetic fixtures can never become authoritative", () => {
    const synthetic = {
      id: "x", task: "t", studentDraft: "d",
      expected: { overallScore: 18 },
    };
    expect(classifyFixtureKind(synthetic)).toBe("synthetic-regression");
  });
});

// ── No-inference guarantees (items 16-19) ──

describe.skipIf(!HAS_SCORED_SCRIPTS)("R3.10-H — score inference audit", () => {
  it("never converts a level into a numeric score", () => {
    const f = realFixture(2012);
    expect(f.publishedLevel).toBe("5**");
    expect(f.overallScore).toBeNull();
    expect(f.contentScore).toBe(7); // published C/L/O only
    expect(JSON.stringify(f)).not.toContain("overallScore\": 21");
  });

  it("never converts a total to a percentage (M1/M2 40/42 stays non-comparable)", () => {
    const f = realFixture(2018);
    expect(f.overallScore).toBeNull();
    expect(f.scoreProvenance.overallScoreBasis).toBeNull();
    expect(f.publishedSubScores).toContainEqual({ label: "total", value: "40/42" });
  });

  it("never derives an overall from criterion scores", () => {
    const f = realFixture(2012);
    expect(f.contentScore).toBe(7);
    expect(f.languageScore).toBe(7);
    expect(f.organizationScore).toBe(7);
    expect(f.overallScore).toBeNull();
  });

  it("ingested dataset contains ZERO inferred scores", () => {
    const result = real();
    for (const fixture of result.fixtures) {
      const hasAnyNumeric = fixture.overallScore !== null
        || fixture.contentScore !== null
        || fixture.languageScore !== null
        || fixture.organizationScore !== null;
      if (hasAnyNumeric) {
        // Every present numeric score must be declared directly scored.
        if (fixture.overallScore !== null) {
          expect(fixture.scoreProvenance.overallScoreDirectlyScored).toBe(true);
        }
        if (fixture.contentScore !== null || fixture.languageScore !== null || fixture.organizationScore !== null) {
          expect(fixture.scoreProvenance.criterionScoresDirectlyScored).toBe(true);
        }
      }
    }
  });
});

// ── End-to-end ingestion with a synthetic scored source ──

const SYNTH_SCORED_TXT = [
  "2019 DSE Part B Q2 (Learning English through Sports Communication)",
  "Q: Write a feature article about a memorable sporting event.",
  "Lv4  C:5  L:5  O:6  Overall: 16/21",
  "The atmosphere in the stadium was electric from the first whistle.",
  "Our team played with remarkable determination throughout the match.",
  "--- Page 2 ---",
  "The final whistle brought scenes of wild celebration.",
  "2019 DSE Part B Q3 (Learning English through Workplace Communication)",
  "Lv5**  Overall: 82/100",
  "Sports have the power to unite people across all boundaries.",
  "Every athlete dreams of the roar of an appreciative crowd.",
  "2019 DSE Part B Q4 (Learning English through Social Issues)",
  "Lv5**  M1:20  M2:19  39/42",
  "Double marking is standard practice in this examination.",
  "2019 DSE Part B Q5 (Learning English through Debating)",
  "Lv4  Overall: 1 8/21",
  "This corrupted score must be quarantined.",
].join("\n");

describe("R3.10-H — end-to-end overall-score ingestion", () => {
  it("ingests labelled overall scores and quarantines corruption deterministically", () => {
    const dir = join(tmpdir(), `hm-h-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(join(dir, "2018 DSE English Paper 2 5starstar scripts.pdf"), "fake-bytes-2018");
      writeFileSync(join(dir, "2018 DSE English Paper 2 5starstar scripts.pdf.txt"), SYNTH_SCORED_TXT);
      writeFileSync(join(dir, "2019 DSE English Paper 2 scripts.pdf"), "fake-bytes-2019");
      writeFileSync(join(dir, "2019 DSE English Paper 2 scripts.pdf.txt"), "--- Page 1 ---\n");
      writeFileSync(join(dir, "Sample Essay and Practical Vocab.pdf"), "fake-bytes-vocab");
      writeFileSync(join(dir, "Sample Essay and Practical Vocab.pdf.txt"), "SAMPLE ESSAYS\nVocab list\n");

      const result = ingestHumanMarkerSources({ sourcesDir: dir });

      // 18/21 → ACCEPT_OVERALL_SCORE with clo-total basis
      const clo = result.fixtures.find(f => f.overallScore === 16);
      expect(clo).toBeDefined();
      expect(clo?.scoreProvenance.overallScoreBasis).toBe("clo-total-0-21");
      expect(clo?.scoreProvenance.overallScoreDirectlyScored).toBe(true);
      expect(clo?.contentScore).toBe(5);
      expect(classifyHumanMarkerEvidence(clo as HumanMarkerCalibrationFixture))
        .toBe("ACCEPT_OVERALL_SCORE");

      // 82/100 → percentage basis
      const pct = result.fixtures.find(f => f.overallScore === 82);
      expect(pct?.scoreProvenance.overallScoreBasis).toBe("percentage-0-100");

      // 40/42-style M1/M2 → NON_COMPARABLE (no overall, verbatim sub-marks)
      const nonComparable = result.fixtures.find(f =>
        f.publishedSubScores?.some(s => s.label === "M1"));
      expect(nonComparable?.overallScore).toBeNull();
      expect(classifyHumanMarkerEvidence(nonComparable as HumanMarkerCalibrationFixture))
        .toBe("NON_COMPARABLE_SCORE");

      // Corrupted overall → quarantined, never repaired
      expect(result.quarantined.some(q => q.reason === "corrupt-overall-score"))
        .toBe(true);
      expect(result.fixtures.some(f => f.overallScore === 18)).toBe(false);

      // Deterministic + idempotent
      const again = ingestHumanMarkerSources({ sourcesDir: dir });
      expect(JSON.stringify(result)).toBe(JSON.stringify(again));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── Duplicates, conflicts, serialization (items 11, 12, 15) ──

describe.skipIf(!HAS_SCORED_SCRIPTS)("R3.10-H — duplicates, conflicts, serialization", () => {
  it("conflicting duplicate overall scores are rejected, never averaged", () => {
    const makeOverall = (score: number): HumanMarkerCalibrationFixture => ({
      ...realFixture(2012),
      contentScore: null,
      languageScore: null,
      organizationScore: null,
      publishedSubScores: undefined,
      overallScore: score,
      scoreProvenance: {
        ...realFixture(2012).scoreProvenance,
        overallScoreDirectlyScored: true,
        overallScoreBasis: "clo-total-0-21",
        criterionScoreBasis: null,
        criterionScoresDirectlyScored: false,
      },
    });
    const result = validateHumanMarkerEvidenceSet([makeOverall(18), makeOverall(12)]);
    expect(result.ok).toBe(false);
    expect(result.conflicts).toHaveLength(1);
  });

  it("identical duplicates are deduplicated deterministically in the runner", async () => {
    const f = realFixture(2012);
    const analyzer = async () => ({
      overallScore: 70, contentScore: 7, languageScore: 7, organizationScore: 7,
      cloTotalScore: 21, dseLevel: "5", platformWritingEstimate: "5",
      strengths: [], weaknesses: [], grammarErrors: [], chinglishWarnings: [],
      vocabularySuggestions: [], structureFeedback: "x", generalComment: "x",
    });
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [f, JSON.parse(JSON.stringify(f))],
      analyzer,
      now: () => "2026-08-13T00:00:00.000Z",
    });
    expect(report.sampleCount).toBe(1);
    expect(report.evidenceBreakdown?.criterionOnly).toBe(1);
  });

  it("serialization preserves the evidence category", () => {
    const f = realFixture(2018);
    const back = JSON.parse(JSON.stringify(f)) as unknown;
    expect(classifyFixtureKind(back)).toBe("human-marker-calibration");
    expect(classifyHumanMarkerEvidence(back as HumanMarkerCalibrationFixture))
      .toBe("NON_COMPARABLE_SCORE");
  });

  it("no score is inferred during serialization", () => {
    const f = realFixture(2012); // criterion-only
    const back = JSON.parse(JSON.stringify(f)) as HumanMarkerCalibrationFixture;
    expect(back.overallScore).toBeNull();
    expect(back.contentScore).toBe(7);
    expect(back.publishedLevel).toBe("5**");
    // Round-trip changes nothing and creates nothing.
    expect(JSON.stringify(back)).toBe(JSON.stringify(f));
  });

  it("no score is inferred during runner execution", async () => {
    // A high-scoring analyzer must not create an overall score for
    // evidence whose source published none.
    const f = realFixture(2012);
    const report = await runHumanMarkerCalibrationBenchmark({
      fixtures: [f],
      analyzer: async () => ({
        overallScore: 98, contentScore: 7, languageScore: 7, organizationScore: 7,
        cloTotalScore: 21, dseLevel: "5", platformWritingEstimate: "5",
        strengths: [], weaknesses: [], grammarErrors: [], chinglishWarnings: [],
        vocabularySuggestions: [], structureFeedback: "x", generalComment: "x",
      }),
    });
    expect(report.metrics.overall.n).toBe(0);
    expect(report.comparisons[0].overallError).toBeNull();
  });
});

// ── Missing-script / missing-hash rejections (items 9, 10) ──

describe.skipIf(!HAS_SCORED_SCRIPTS)("R3.10-H — required evidence fields", () => {
  it("missing student script is rejected", () => {
    const noScript = { ...realFixture(2012), studentScript: "   " };
    const result = validateHumanMarkerFixture(noScript);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("studentScript");
  });

  it("missing source hash is rejected", () => {
    const noHash = {
      ...realFixture(2012),
      provenance: { ...realFixture(2012).provenance, sourceHash: "" },
    };
    const result = validateHumanMarkerFixture(noHash);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("sourceHash");
  });

  it("the inventory is deterministic and never collapses categories", () => {
    const a = buildEvidenceInventory(real());
    const b = buildEvidenceInventory(real());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const classes = a.candidates.map(c => c.evidenceClass).sort();
    expect(classes).toEqual(["ACCEPT_CRITERION_ONLY", "ACCEPT_CRITERION_ONLY", "NON_COMPARABLE_SCORE"]);
    // Every candidate keeps its own class — nothing collapsed to a single total.
    expect(new Set(classes).size).toBe(2);
  });

  it("the inventory summary reports all 7 classes and ZERO inferred scores", () => {
    const inventory = buildEvidenceInventory(real());
    expect(inventory.summary.byClass).toEqual({
      ACCEPT_OVERALL_SCORE: 0,
      ACCEPT_CRITERION_ONLY: 2,
      LEVEL_ONLY: 0,
      NON_COMPARABLE_SCORE: 1,
      TEACHING_REFERENCE: 1,   // Sample Essay/Vocab document
      IMAGE_ONLY_UNREADABLE: 1, // 2019 image-only scan
      CONFLICT: 0,
    });
    expect(inventory.summary.inferredScores).toBe(0);
    expect(inventory.summary.acceptedFixtures).toBe(3);
    expect(inventory.summary.uniqueScripts).toBe(3);
    expect(inventory.summary.duplicateScripts).toBe(0);
    expect(inventory.summary.quarantinedScripts).toBe(0);
  });

  it("source hashes in the inventory match the exact PDF bytes", () => {
    const inventory = buildEvidenceInventory(real());
    for (const source of inventory.sources) {
      const pdfPath = join(SOURCES_DIR, source.sourceFilename);
      expect(sha256OfBytes(readFileSync(pdfPath))).toBe(source.sha256);
    }
  });
});
