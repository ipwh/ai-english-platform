// ============================================
// R3.10-F: Ingestion Pipeline Tests
//
// Covers Phase 8 items:
//   5. invalid extraction is rejected
//   6. ingestion is deterministic
//   7. ingestion is idempotent
//   8. duplicate source samples are detected
// Plus evidence assertions against the REAL checked-in
// authoritative artifacts (ingested from the actual HKEAA
// materials in this repository).
// ============================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseExemplarBooklet } from "../ingestion/parse-exemplar-booklet";
import { parseLevelDescriptors } from "../ingestion/parse-level-descriptors";
import { parsePaper4Samples } from "../ingestion/parse-paper4-samples";
import { ingestHKEAAMaterials } from "../ingestion/ingest-hkeaa";
import { writeIngestionOutput } from "../ingestion/write-ingestion-output";
import { validateAuthoritativeFixture } from "../provenance";
import type { HKEAAPaper } from "../types";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const MATERIALS_DIR = join(ROOT, "materials", "_extracted");
const DESCRIPTORS_DIR = join(ROOT, "materials", "_hkeaa_descriptors");
const FIXTURES_DIR = join(__dirname, "..", "fixtures", "hkeaa");

// ── Synthetic booklet text for deterministic/duplicate tests ──

function bookletText(year: number, extraBooklet = false): string {
  const booklets: string[] = [];
  const one = (yr: number): string => [
    "TABLE OF CONTENTS",
    `Level 5 exemplar 1`,
    `Level 5 exemplar 2`,
    `Level 1 exemplar 1`,
    `Level 1 exemplar 2`,
    "INTRODUCTION",
    `To enhance understanding of the standards of the HKDSE Examination, authentic samples of candidates' scripts in the ${yr} examination are selected.`,
    "2 Level 5 exemplar 1",
    "Part A",
    "--- Page 3 ---",
    "3 Level 5 exemplar 1",
    "Part B Question 4",
    "--- Page 4 ---",
    "4 Level 5 exemplar 1",
    "Comments",
    "Level 5 candidates typically provide content that is relevant and extensive.",
    "5 Level 5 exemplar 2",
    "Part A",
    "--- Page 6 ---",
    "6 Level 1 exemplar 1",
    "Part A",
    "--- Page 7 ---",
    "7 Level 1 exemplar 2",
    "Part A",
    "--- Page 8 ---",
  ].join("\n");
  booklets.push(one(year));
  if (extraBooklet) booklets.push(one(year));
  return booklets.join("\n\n");
}

describe("Ingestion — exemplar booklet parser", () => {
  it("rejects input with no year marker (quarantined, not guessed)", () => {
    const r = parseExemplarBooklet("Level 5 exemplar 1\nPart A\nsome script text here that is quite long", {
      paper: "Paper 2",
      sourceDocument: "x.pdf",
      sourceFile: "x.txt",
    });
    expect(r.fixtures).toHaveLength(0);
    expect(r.quarantined.some(q => q.reason === "ambiguous-year")).toBe(true);
  });

  it("is deterministic — two parses of the same text are identical", () => {
    const text = bookletText(2024);
    const meta = { paper: "Paper 2" as HKEAAPaper, sourceDocument: "x.pdf", sourceFile: "x.txt" };
    const a = parseExemplarBooklet(text, meta);
    const b = parseExemplarBooklet(text, meta);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is deterministic across fixture orderings (sorted by id)", () => {
    const text = bookletText(2023);
    const r = parseExemplarBooklet(text, { paper: "Paper 2", sourceDocument: "x.pdf", sourceFile: "x.txt" });
    const ids = r.fixtures.map(f => f.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("detects duplicate source samples (same booklet published twice)", () => {
    const text = bookletText(2021, true);
    const r = parseExemplarBooklet(text, { paper: "Paper 2", sourceDocument: "x.pdf", sourceFile: "x.txt" });
    const duplicates = r.quarantined.filter(q => q.reason === "duplicate-source-sample");
    expect(duplicates.length).toBe(4);
    // Unique fixtures only
    expect(r.fixtures).toHaveLength(4);
  });

  it("records published level only — never numeric scores", () => {
    const r = parseExemplarBooklet(bookletText(2024), {
      paper: "Paper 2", sourceDocument: "x.pdf", sourceFile: "x.txt",
    });
    for (const f of r.fixtures) {
      expect(f.publishedLevel).not.toBeNull();
      expect(f.publishedOverallScore).toBeNull();
      expect(f.publishedContentScore).toBeNull();
      expect(f.criterionScoresOfficiallyPublished).toBe(false);
    }
  });

  it("page labels are not mistaken for new sections", () => {
    const r = parseExemplarBooklet(bookletText(2024), {
      paper: "Paper 2", sourceDocument: "x.pdf", sourceFile: "x.txt",
    });
    // "2/3/4 Level 5 exemplar 1" labels all belong to one section
    expect(r.fixtures).toHaveLength(4);
    const first = r.fixtures.find(f => f.id.endsWith("level5-exemplar1"));
    expect(first?.provenance.sourcePageRange).toBe("3-4");
  });

  it("captures task references (Part A + Part B Question N) deterministically", () => {
    const r = parseExemplarBooklet(bookletText(2024), {
      paper: "Paper 2", sourceDocument: "x.pdf", sourceFile: "x.txt",
    });
    const first = r.fixtures.find(f => f.id.endsWith("level5-exemplar1"));
    expect(first?.provenance.taskId).toBe("P2-2024-PartB-Q4+PartA");
  });
});

describe("Ingestion — Paper 4 parser", () => {
  const P4 = [
    "For the 2024 samples of performance for English Language Paper 4, four videos have been provided.",
    "Video  Candidate / Level of Performance  Question Paper / Version",
    "1 Candidate A – L5",
    "Candidate B – L2",
    "Candidate C – L2",
    "Candidate D – L4 2024 – Eng Lang Paper 4 – 1.1",
    "Digital museum",
    "2 Candidate A – L3",
    "Candidate B – L4",
  ].join("\n");

  it("parses numbered and continuation candidate rows under one video", () => {
    const r = parsePaper4Samples(P4, { sourceDocument: "x.pdf", sourceFile: "x.txt" });
    expect(r.fixtures).toHaveLength(6);
    const v1 = r.fixtures.filter(f => f.provenance.taskId === "P4-2024-V1");
    expect(v1).toHaveLength(4);
    expect(v1.map(f => f.publishedLevel).sort()).toEqual([2, 2, 4, 5]);
    const d = v1.find(f => f.provenance.sectionId.includes("D"));
    expect(d?.publishedLevel).toBe(4);
  });

  it("quarantines year sections with no parseable candidates", () => {
    const r = parsePaper4Samples(
      "For the 2023 samples of performance for English Language Paper 4, four videos have been provided.\nVideo table text here",
      { sourceDocument: "x.pdf", sourceFile: "x.txt" },
    );
    expect(r.fixtures).toHaveLength(0);
    expect(r.quarantined.some(q => q.reason === "unparseable-section")).toBe(true);
  });
});

describe("Ingestion — level descriptor parser", () => {
  const DESCRIPTORS = [
    "HONG KONG DIPLOMA OF SECONDARY EDUCATION EXAMINATION",
    "ENGLISH LANGUAGE",
    "LEVEL DESCRIPTORS",
    "Writing Descriptors",
    "Level 5",
    "Content",
    "The content is relevant and extensive.",
    "Language and style",
    "A wide range of sentence structures is used accurately.",
    "Organization",
    "The structure of the writing is wholly coherent.",
    "Level 4",
    "Content",
    "The content is relevant, in parts detailed.",
    "Language and style",
    "A range of sentence structures is used.",
    "Organization",
    "The structure is coherent in most parts.",
  ].join("\n");

  it("splits C/L/O dimensions when headers are present", () => {
    const r = parseLevelDescriptors(DESCRIPTORS, {
      scope: "level-descriptors-writing",
      paper: "Paper 2",
      sourceDocument: "LevelDescriptors-ENG-Writing.pdf",
      sourceFile: "x.txt",
      sourceYear: null,
      splitDimensions: true,
    });
    expect(r.references).toHaveLength(6);
    const l5 = r.references.filter(ref => ref.level === 5);
    expect(l5.map(ref => ref.dimension).sort()).toEqual(["content", "language", "organization"]);
    const content = l5.find(ref => ref.dimension === "content");
    expect(content?.descriptorText).toContain("relevant and extensive");
    expect(content?.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("emits an aggregate reference (never guessed splits) when dimensions are incomplete", () => {
    const text = ["Level 3", "Content", "Most of the content is relevant.", "Some language text."].join("\n");
    const r = parseLevelDescriptors(text, {
      scope: "level-descriptors-writing",
      paper: "Paper 2",
      sourceDocument: "x.pdf",
      sourceFile: "x.txt",
      sourceYear: null,
      splitDimensions: true,
    });
    expect(r.references).toHaveLength(1);
    expect(r.references[0].dimension).toBeNull();
  });
});

describe("Ingestion — real HKEAA source material (evidence)", () => {
  it("ingests the real materials deterministically and fail-closed", () => {
    const r = ingestHKEAAMaterials({ materialsDir: MATERIALS_DIR, descriptorsDir: DESCRIPTORS_DIR });
    for (const f of r.fixtures) {
      expect(validateAuthoritativeFixture(f).ok, `fixture ${f.id} must validate`).toBe(true);
    }
    expect(r.fixtures.length).toBe(308);
    expect(r.rubricReferences.length).toBe(34);
    expect(r.quarantined.filter(q => q.reason === "duplicate-source-sample")).toHaveLength(40);
  });

  it("ingestion is idempotent over the real materials", () => {
    const a = ingestHKEAAMaterials({ materialsDir: MATERIALS_DIR, descriptorsDir: DESCRIPTORS_DIR });
    const b = ingestHKEAAMaterials({ materialsDir: MATERIALS_DIR, descriptorsDir: DESCRIPTORS_DIR });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("Paper 2 calibration fixtures exist for 2020-2025 with official levels", () => {
    const files = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("hkeaa-p2-"));
    const years = new Set<number>();
    for (const file of files) {
      const raw = readFileSync(join(FIXTURES_DIR, file), "utf-8");
      const f = JSON.parse(raw);
      years.add(f.provenance.sourceYear);
      expect(f.publishedLevel).toBeGreaterThanOrEqual(1);
      expect(f.publishedLevel).toBeLessThanOrEqual(5);
      expect(f.publishedOverallScore).toBeNull();
    }
    expect([...years].sort()).toEqual([2020, 2021, 2022, 2023, 2024, 2025]);
    expect(files).toHaveLength(100);
  });

  it("no ingested fixture contains fabricated numeric scores", () => {
    const files = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("hkeaa-p"));
    for (const file of files) {
      const raw = readFileSync(join(FIXTURES_DIR, file), "utf-8");
      const f = JSON.parse(raw);
      expect(f.publishedOverallScore).toBeNull();
      expect(f.publishedContentScore).toBeNull();
      expect(f.publishedLanguageScore).toBeNull();
      expect(f.publishedOrganizationScore).toBeNull();
      expect(f.criterionScoresOfficiallyPublished).toBe(false);
    }
  });

  it("every ingested fixture carries full HKEAA provenance with a source hash", () => {
    const files = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("hkeaa-p"));
    for (const file of files) {
      const raw = readFileSync(join(FIXTURES_DIR, file), "utf-8");
      const f = JSON.parse(raw);
      expect(f.provenance.sourceOrganization).toBe("hkeaa");
      expect(f.provenance.sourceDocument).toBeTruthy();
      expect(f.provenance.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(f.provenance.sourceFile).toBeTruthy();
    }
  });

  it("the quarantine record is checked in and describes duplicate source samples", () => {
    const quarantinePath = join(FIXTURES_DIR, "quarantine.json");
    expect(existsSync(quarantinePath)).toBe(true);
    const q = JSON.parse(readFileSync(quarantinePath, "utf-8"));
    expect(q.records.filter((r: { reason: string }) => r.reason === "duplicate-source-sample"))
      .toHaveLength(40);
  });
});

describe("Ingestion — output writer (immutability + idempotency)", () => {
  function tmpDir(): string {
    return join(tmpdir(), `cal-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  }

  it("second write of identical content is a no-op (idempotent)", () => {
    const fixtures = [parseExemplarBooklet(bookletText(2024), {
      paper: "Paper 2", sourceDocument: "x.pdf", sourceFile: "x.txt",
    }).fixtures[0]];
    const dir = tmpDir();
    try {
      const first = writeIngestionOutput(fixtures, [], [], { outDir: dir });
      expect(first.written.length).toBeGreaterThan(0);
      const second = writeIngestionOutput(fixtures, [], [], { outDir: dir });
      expect(second.written).toHaveLength(0);
      expect(second.unchanged.length).toBeGreaterThan(0);
      expect(second.conflicts).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("different content under the same id conflicts (never mutated silently)", () => {
    const base = parseExemplarBooklet(bookletText(2024), {
      paper: "Paper 2", sourceDocument: "x.pdf", sourceFile: "x.txt",
    }).fixtures[0];
    const changed = { ...base, notes: `${base.notes} (source changed)` };
    const dir = tmpDir();
    try {
      writeIngestionOutput([base], [], [], { outDir: dir });
      const outcome = writeIngestionOutput([changed], [], [], { outDir: dir });
      expect(outcome.conflicts).toHaveLength(1);
      expect(outcome.written).toHaveLength(0);
      // Original file untouched
      const onDisk = JSON.parse(readFileSync(join(dir, `${base.id}.json`), "utf-8"));
      expect(onDisk.notes).toBe(base.notes);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
