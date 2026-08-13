// ============================================
// R3.10-F: Exemplar Booklet Parser
//
// Deterministic parser for the HKEAA official sample booklets
// (Paper 1 / Paper 2 / Paper 3 "Samples" PDFs). Pure function:
// no randomness, no timestamps, no LLM, no database.
//
// What the source contains (verified):
//   - one booklet per examination year, each with its own
//     "INTRODUCTION ... candidates' scripts in the YYYY examination"
//   - 10 exemplar sections per year (Level 5/4/3/2/1 × 2)
//   - sections with "Part A" / "Part B1" / "Part B2" /
//     "Part B Question N" page headers and an examiner "Comments"
//     section
//   - candidate scripts are HANDWRITTEN SCANS: the PDF extraction
//     contains only page headers for script pages (no text layer)
//
// Rules honoured:
//   - published numeric scores are NEVER inferred: only the
//     officially published LEVEL is recorded
//   - ambiguous sections are quarantined, never guessed
//   - duplicate source samples are quarantined, never merged
// ============================================

import type {
  AuthoritativeCalibrationFixture,
  ExtractionStatus,
  HKEAAPaper,
  HKEAALevel,
  QuarantineRecord,
} from "../types";
import { computeProvenanceHash } from "../provenance";

export interface BookletParserMeta {
  paper: HKEAAPaper;
  sourceDocument: string;
  sourceFile: string;
}

export interface ParsedBooklet {
  fixtures: AuthoritativeCalibrationFixture[];
  quarantined: QuarantineRecord[];
}

/** Year introduction marker: "...candidates' scripts in the YYYY examination". */
const YEAR_INTRO_RE = /scripts.{0,60}?in the (20 ?\d ?\d)\s+examination/gi;
/**
 * Exemplar section header: "Level N exemplar M" (page-label prefix
 * tolerated). 2020-2023 booklets publish 2 exemplars per level;
 * 2024+ booklets publish 4 per level.
 */
const EXEMPLAR_RE = /\bLevel\s+([1-5])\s+exemplar\s+([1-9]\d?)\b/gi;
/** Booklet boundary: each year's booklet starts with a table of contents. */
const TOC_RE = /^\s*TABLE OF CONTENTS\s*$/gim;
/** Part header: "Part A" / "Part B1" / "Part B2". */
const PART_RE = /\bPart\s+([AB]\d?)\b/g;
/** Paper 2 specific: "Part B Question N". */
const PART_B_Q_RE = /\bPart\s+B\s+Question\s+(\d+)\b/gi;
/** OCR variant of the task reference: "(Question 1 & 2)". */
const QUESTION_PAIR_RE = /\(\s*Question\s+(\d+)\s*&\s*(\d+)\s*\)/gi;

function normalizeYear(raw: string): number {
  return Number.parseInt(raw.replace(/\s+/g, ""), 10);
}

/** True when the line is a page label / part header rather than prose. */
function isHeaderLike(line: string): boolean {
  const t = line.trim();
  if (t === "") return true;
  if (/^--- Page \d+ ---$/.test(t)) return true;
  if (/^\d+\s+Level\s+[1-5]\s+exemplar\s+[1-9]\d?$/.test(t)) return true;
  if (/^Level\s+[1-5]\s+exemplar\s+[1-9]\d?.*$/.test(t) && t.length < 60) return true;
  if (/^Part\s+([AB]\d?)(\s+Question\s+\d+)?$/.test(t)) return true;
  if (/^\(\s*Question\s+\d+\s*&\s*\d+\s*\)$/.test(t)) return true;
  return false;
}

interface SectionSpan {
  start: number;
  end: number;
  level: HKEAALevel;
  exemplar: number;
  text: string;
}

interface YearBlock {
  year: number;
  start: number;
  end: number;
  text: string;
}

/**
 * Split the source text into per-year booklets.
 *
 * Each official booklet begins with its own "TABLE OF CONTENTS" and
 * contains an introduction ("...candidates' scripts in the YYYY
 * examination...") followed by the exemplar sections. Splitting on
 * TOC boundaries keeps the NEXT booklet's contents page out of the
 * current booklet's section list.
 */
function splitYearBlocks(text: string): { blocks: YearBlock[]; quarantined: QuarantineRecord[] } {
  const tocMatches = [...text.matchAll(TOC_RE)];
  const tocIndexes = tocMatches.map(m => m.index ?? 0);
  const booklets: Array<{ start: number; end: number; text: string }> = [];
  if (tocIndexes.length === 0) {
    booklets.push({ start: 0, end: text.length, text });
  } else {
    for (let i = 0; i < tocIndexes.length; i += 1) {
      const start = tocIndexes[i];
      const end = i + 1 < tocIndexes.length ? tocIndexes[i + 1] : text.length;
      booklets.push({ start, end, text: text.slice(start, end) });
    }
  }

  const blocks: YearBlock[] = [];
  const quarantined: QuarantineRecord[] = [];
  for (const booklet of booklets) {
    // Year comes from the introduction; sections start AFTER it so the
    // table-of-contents entries are never treated as exemplar sections.
    const yearMatch = [...booklet.text.matchAll(YEAR_INTRO_RE)][0];
    if (!yearMatch) {
      quarantined.push({
        id: `booklet-${booklet.start}-unknown-year`,
        reason: "ambiguous-year",
        sourceFile: "",
        detail: "Booklet has no HKEAA introduction year marker",
      });
      continue;
    }
    const year = normalizeYear(yearMatch[1]);
    if (!Number.isInteger(year) || year < 2010 || year > 2100) {
      quarantined.push({
        id: `booklet-${booklet.start}-invalid-year`,
        reason: "ambiguous-year",
        sourceFile: "",
        detail: `Unrecognized year text: ${yearMatch[1]}`,
      });
      continue;
    }
    const start = booklet.start + (yearMatch.index ?? 0);
    blocks.push({ year, start, end: booklet.end, text: booklet.text.slice((yearMatch.index ?? 0)) });
  }
  return { blocks, quarantined };
}

/**
 * Split a year block into exemplar sections (in document order).
 *
 * Every page of an exemplar carries a running page label like
 * "3 Level 5 exemplar 1" — a match only opens a NEW section when its
 * (level, exemplar) pair differs from the currently open section.
 */
function splitExemplarSections(block: YearBlock): SectionSpan[] {
  const matches = [...block.text.matchAll(EXEMPLAR_RE)];
  const sections: SectionSpan[] = [];
  let current: SectionSpan | null = null;

  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const level = Number.parseInt(m[1], 10) as HKEAALevel;
    const exemplar = Number.parseInt(m[2], 10);
    const at = m.index ?? 0;

    if (current !== null && current.level === level && current.exemplar === exemplar) {
      // Page label continuation of the current section — extend its span.
      current.end = block.text.length;
      continue;
    }

    if (current !== null) {
      sections.push(current);
    }
    current = {
      start: at,
      end: block.text.length,
      level,
      exemplar,
      text: "",
    };
  }
  if (current !== null) {
    sections.push(current);
  }

  // Materialize each section's text slice after all boundaries are known.
  const bounds = sections.map((s, i) => ({
    start: s.start,
    end: i + 1 < sections.length ? sections[i + 1].start : block.text.length,
  }));
  return sections.map((s, i) => ({
    ...s,
    end: bounds[i].end,
    text: block.text.slice(bounds[i].start, bounds[i].end),
  }));
}

interface SectionFacts {
  parts: string[];           // e.g. ["Part A", "Part B Question 4"]
  pages: string[];           // ordered unique page numbers
  commentsPresent: boolean;
  substantiveLineCount: number;
}

function analyseSection(section: SectionSpan): SectionFacts {
  const parts: string[] = [];
  const pages: string[] = [];
  let commentsPresent = false;
  let commentsIndex: number | null = null;
  let substantiveLineCount = 0;

  const addPart = (part: string) => {
    if (!parts.includes(part)) parts.push(part);
  };
  for (const m of section.text.matchAll(PART_B_Q_RE)) addPart(`Part B Question ${m[1]}`);
  for (const m of section.text.matchAll(PART_RE)) addPart(`Part ${m[1]}`);
  for (const m of section.text.matchAll(QUESTION_PAIR_RE)) addPart(`(Question ${m[1]} & ${m[2]})`);

  // Bare "Part B" is the OCR fragment of "Part B Question N" —
  // drop it when the specific question reference exists.
  const cleanedParts = parts.filter(
    p => p !== "Part B" || !parts.some(x => x.startsWith("Part B Question")),
  );

  const lines = section.text.split("\n");
  lines.forEach((line, idx) => {
    const pm = line.match(/--- Page (\d+) ---/);
    if (pm) pages.push(pm[1]);
    if (/^\s*Comments\s*$/.test(line) && commentsIndex === null) {
      commentsPresent = true;
      commentsIndex = idx;
    }
  });

  // Substantive content lines = prose longer than header artifacts,
  // outside the examiner comments section (script pages would appear
  // before Comments; comment prose is excluded from the script check).
  lines.forEach((line, idx) => {
    if (commentsIndex !== null && idx >= commentsIndex) return;
    if (!isHeaderLike(line) && line.trim().length >= 30) {
      substantiveLineCount += 1;
    }
  });

  return { parts: cleanedParts, pages, commentsPresent, substantiveLineCount };
}

function buildTaskId(paper: HKEAAPaper, year: number, parts: string[]): string {
  if (parts.length === 0) {
    return `P${paper.slice(-1)}-${year}-unknown-section`;
  }
  const norm = parts.map(p => {
    if (p.startsWith("Part B Question")) return `PartB-Q${p.replace(/\D/g, "")}`;
    if (p.startsWith("(Question")) {
      const nums = [...p.matchAll(/\d+/g)].map(m => m[0]);
      return `Q${nums.join("+")}`;
    }
    return p.replace(/^Part\s+/, "Part").replace(/\s+/g, "");
  });
  return `P${paper.slice(-1)}-${year}-${norm.join("+")}`;
}

/**
 * Parse one exemplar booklet text into authoritative fixtures.
 * Duplicate source samples (same year+level+exemplar) are
 * quarantined with reason "duplicate-source-sample".
 */
export function parseExemplarBooklet(
  text: string,
  meta: BookletParserMeta,
): ParsedBooklet {
  const normalized = text.replace(/\r\n?/g, "\n");
  const { blocks, quarantined } = splitYearBlocks(normalized);
  const fixtures: AuthoritativeCalibrationFixture[] = [];
  const seen = new Set<string>();
  const quarantine = [...quarantined];

  for (const block of blocks) {
    const sections = splitExemplarSections(block);
    if (sections.length === 0) {
      quarantine.push({
        id: `${meta.paper.toLowerCase().replace(" ", "")}-${block.year}-no-exemplar-sections`,
        reason: "unparseable-section",
        sourceFile: meta.sourceFile,
        detail: `Year ${block.year} booklet has no parseable exemplar sections`,
      });
      continue;
    }
    for (const section of sections) {
      const facts = analyseSection(section);
      const key = `${meta.paper}|${block.year}|${section.level}|${section.exemplar}`;
      const id = `hkeaa-p${meta.paper.slice(-1)}-${block.year}-level${section.level}-exemplar${section.exemplar}`;

      if (seen.has(key)) {
        quarantine.push({
          id: `${id}-duplicate`,
          reason: "duplicate-source-sample",
          sourceFile: meta.sourceFile,
          detail:
            `Duplicate of ${id}: year ${block.year}, level ${section.level}, `
            + `exemplar ${section.exemplar} appears more than once in the source`,
        });
        continue;
      }
      seen.add(key);

      if (facts.parts.length === 0 && !facts.commentsPresent) {
        quarantine.push({
          id,
          reason: "unparseable-section",
          sourceFile: meta.sourceFile,
          detail:
            `No part header and no examiner comments found for year ${block.year}, `
            + `level ${section.level}, exemplar ${section.exemplar}`,
        });
        continue;
      }

      const extractionStatus: ExtractionStatus =
        facts.substantiveLineCount > 0
          ? "complete-script-text"
          : "script-not-in-extraction";

      const sourceHash = computeProvenanceHash([
        meta.sourceDocument,
        meta.paper,
        String(block.year),
        section.text,
      ]);

      fixtures.push({
        kind: "authoritative-calibration",
        id,
        schemaVersion: 1,
        provenance: {
          sourceOrganization: "hkeaa",
          sourceDocument: meta.sourceDocument,
          sourceYear: block.year,
          paper: meta.paper,
          taskId: buildTaskId(meta.paper, block.year, facts.parts),
          sectionId: `Level ${section.level} exemplar ${section.exemplar}`,
          sourceFile: meta.sourceFile,
          sourcePageRange: facts.pages.length > 0
            ? `${facts.pages[0]}-${facts.pages[facts.pages.length - 1]}`
            : undefined,
          sourceHash,
          extractionStatus,
        },
        studentScript: null,
        publishedLevel: section.level,
        publishedOverallScore: null,
        publishedContentScore: null,
        publishedLanguageScore: null,
        publishedOrganizationScore: null,
        criterionScoresOfficiallyPublished: false,
        rubricVersion: "HKEAA-official-exemplar-levels",
        calibrationStatus: "ingested-level-only",
        notes:
          `Machine-extracted from official exemplar booklet. `
          + `Sections: ${facts.parts.join(", ") || "none"}. `
          + `Examiner comments: ${facts.commentsPresent ? "present" : "absent"}. `
          + `Candidate script is a handwritten scan ${extractionStatus === "complete-script-text" ? "with extracted text" : "with NO text layer in the PDF extraction"}. `
          + `Published level only — no numeric marks are published for this sample.`,
      });
    }
  }

  fixtures.sort((a, b) => a.id.localeCompare(b.id));
  quarantine.sort((a, b) => a.id.localeCompare(b.id));
  return { fixtures, quarantined: quarantine };
}
