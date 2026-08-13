// ============================================
// R3.10-G: Human-Marker Evidence Ingestion
//
// Transforms the owner-supplied HKEAA scored-script PDFs into
// HumanMarkerCalibrationFixture[] — WITHOUT inference:
//   - published level stays a level string ("5**"), never a number
//   - published C/L/O stays C/L/O (never a derived total)
//   - published M1/M2 sub-marks stay verbatim provenance records
//   - script text is preserved verbatim (no grammar/spelling/OCR
//     "improvement"); fidelity is declared via extractionQuality
//
// Source authority is an EXPLICIT OWNER ASSERTION carried in
// provenance — it never bypasses score, hash, script, policy,
// category, or conflict validation.
//
// Offline + deterministic: no network, no database, no timestamps
// in fixture content.
// ============================================

import { readFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type {
  HumanMarkerCalibrationFixture,
  HumanMarkerSourceManifestEntry,
} from "../types";
import {
  buildHumanMarkerFixtureId,
  classifyHumanMarkerEvidence,
  classifyHumanMarkerSource,
  validateHumanMarkerEvidenceSet,
  validateHumanMarkerFixture,
  type SourceClassificationInput,
} from "../human-marker";

// ============================================
// Fixed source inventory (deterministic — no scanning)
// ============================================

interface SourceEntry {
  pdfFile: string;
  txtFile: string;
  sourceUrl: string;
}

export const HUMAN_MARKER_SOURCES: SourceEntry[] = [
  {
    pdfFile: "2018 DSE English Paper 2 5starstar scripts.pdf",
    txtFile: "2018 DSE English Paper 2 5starstar scripts.pdf.txt",
    sourceUrl:
      "https://storage.googleapis.com/afterschool-9bc37.appspot.com/resource/7/18%20DSE%20English%20Paper%202%205__%E7%9C%9F%E8%B7%A1.pdf",
  },
  {
    pdfFile: "2019 DSE English Paper 2 scripts.pdf",
    txtFile: "2019 DSE English Paper 2 scripts.pdf.txt",
    sourceUrl:
      "https://storage.googleapis.com/afterschool-9bc37.appspot.com/resource/26/19%20DSE%20%E8%8B%B1%E6%96%87Paper%202%E7%9C%9F%E8%B7%A1(85.pdf",
  },
  {
    pdfFile: "Sample Essay and Practical Vocab.pdf",
    txtFile: "Sample Essay and Practical Vocab.pdf.txt",
    sourceUrl:
      "https://storage.googleapis.com/afterschool-9bc37.appspot.com/resource/7/5__%20Sample%20Esaay%20%E9%80%A3%E5%AF%A6%E7%94%A8Vocab.pdf",
  },
];

const OWNER_ASSERTION = {
  assertedBy: "repository-owner",
  authority: "HKEAA",
  acquisitionMethod: "direct-source",
  verificationRequired: false,
} as const;

const ACQUISITION_DATE = "2026-08-13";

// ============================================
// Section parsing
// ============================================

/** "Lv5**  M1:21  M2:19   40/42" or "Lv 5**   C:7  L:7  O:7".
 *  Ordered alternatives + negative lookahead so "5**" wins over
 *  "5" and a bare level never matches inside a starred level. */
const SCORE_HEADER_RE = /^Lv\s*(5\*\*|5\*|[1-5]|[uU])(?![A-Za-z0-9*])/i;
/** Document-level variant (multiline) used for source classification facts. */
const LEVEL_FACT_RE = /^Lv\s*(5\*\*|5\*|[1-5]|[uU])(?![A-Za-z0-9*])/im;
const CRITERION_RE = /C\s*:\s*(\d+)\s*L\s*:\s*(\d+)\s*O\s*:\s*(\d+)/i;
const SUB_MARK_RE = /M1\s*:\s*(\d+)\s*M2\s*:\s*(\d+)\s*(\d+)\s*\/\s*(\d+)/i;
/** "2018 DSE Part B Q5 (Learning English through Debating)" / "2012 DSE Q9". */
const TASK_RE = /(\d{4})\s*DSE\s*(?:Part\s*([AB])\s*)?Q(\d+)\s*(?:\(([^)]*)\))?/i;
const PAGE_RE = /^--- Page (\d+) ---$/;

/**
 * Explicit overall-score labels. A numeric value is accepted as an
 * overall score ONLY when introduced by one of these labels — a bare
 * number near an essay is never treated as a score.
 */
const OVERALL_LABEL_RES = [
  /Overall(?:\s*score)?\s*:\s*(\d+)\s*\/\s*(\d+)(?!\s*\d)/i,
  /Total(?:\s*(?:mark|score))?\s*:\s*(\d+)\s*\/\s*(\d+)(?!\s*\d)/i,
  /\bMark\s*:\s*(\d+)\s*\/\s*(\d+)(?!\s*\d)/i,
  /\bScore\s*:\s*(\d+)\s*\/\s*(\d+)(?!\s*\d)/i,
];
/** Label present but value malformed (OCR corruption) — fail closed. */
const OVERALL_LABEL_PRESENT_RE = /Overall(?:\s*score)?\s*:|Total(?:\s*(?:mark|score))?\s*:|\bMark\s*:|\bScore\s*:/i;

interface ParsedOverall {
  numerator: number;
  denominator: number;
  /** Established ONLY from the source's own denominator: /21 or /100. */
  basis: "clo-total-0-21" | "percentage-0-100" | null;
}

/**
 * Parse an explicitly-labelled overall score. Returns:
 *   - a value when a labelled "N/D" is present (scale established by
 *     the source's denominator: /21 → clo-total, /100 → percentage)
 *   - null when no overall label exists (no inference attempted)
 *   - "corrupt" when a label exists but the value is malformed
 */
export function parseOverallScore(text: string): ParsedOverall | null | "corrupt" {
  const labelPresent = OVERALL_LABEL_PRESENT_RE.test(text);
  for (const re of OVERALL_LABEL_RES) {
    const m = text.match(re);
    if (m) {
      const numerator = Number.parseInt(m[1], 10);
      const denominator = Number.parseInt(m[2], 10);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return "corrupt";
      }
      const basis = denominator === 21
        ? "clo-total-0-21"
        : denominator === 100
          ? "percentage-0-100"
          : null;
      return { numerator, denominator, basis };
    }
  }
  if (labelPresent) return "corrupt";
  return null;
}

interface ScriptSection {
  headerIndex: number;
  level: string;
  criterion: { content: number; language: number; organization: number } | null;
  subMarks: { m1: number; m2: number; totalNumerator: number; totalDenominator: number } | null;
  text: string;
}

function splitSections(lines: string[]): ScriptSection[] {
  const sections: ScriptSection[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(SCORE_HEADER_RE);
    if (!m) continue;
    const level = m[1].toUpperCase();
    const criterion = lines[i].match(CRITERION_RE);
    const subMarks = lines[i].match(SUB_MARK_RE);
    const start = i + 1;
    let end = lines.length;
    for (let j = start; j < lines.length; j += 1) {
      if (SCORE_HEADER_RE.test(lines[j])) {
        end = j;
        break;
      }
    }
    sections.push({
      headerIndex: i,
      level,
      criterion: criterion
        ? {
          content: Number.parseInt(criterion[1], 10),
          language: Number.parseInt(criterion[2], 10),
          organization: Number.parseInt(criterion[3], 10),
        }
        : null,
      subMarks: subMarks
        ? {
          m1: Number.parseInt(subMarks[1], 10),
          m2: Number.parseInt(subMarks[2], 10),
          totalNumerator: Number.parseInt(subMarks[3], 10),
          totalDenominator: Number.parseInt(subMarks[4], 10),
        }
        : null,
      text: lines.slice(start, end).join("\n"),
    });
  }
  return sections;
}

/**
 * Extract the verbatim student script from a section.
 *
 * Dropped, in order (all machine facts, never script prose):
 *   1. the task/header line and the "Q:" prompt block (sub-items
 *      starting with "<")
 *   2. the "3 THINGS TO INCLUDE" teaching block up to the next
 *      page marker (compilation annotation, not student work)
 *   3. page markers themselves
 * Everything else is kept EXACTLY as extracted (spacing, spelling
 * artifacts, punctuation) — no normalization, no "improvement".
 */
export function extractStudentScript(sectionText: string): string {
  const lines = sectionText.split("\n");
  const out: string[] = [];
  let inPromptBlock = false;
  let inTeachingBlock = false;

  for (const line of lines) {
    if (inTeachingBlock) {
      if (PAGE_RE.test(line.trim())) inTeachingBlock = false;
      continue;
    }
    const trimmed = line.trim();
    if (TASK_RE.test(trimmed)) continue;
    if (/^Q\s*:/i.test(trimmed)) {
      inPromptBlock = true;
      continue;
    }
    if (inPromptBlock) {
      if (trimmed === "") continue;
      if (/^</.test(trimmed)) continue;
      inPromptBlock = false;
    }
    if (/^3 THINGS TO INCLUDE/i.test(trimmed)) {
      inTeachingBlock = true;
      continue;
    }
    if (PAGE_RE.test(trimmed)) continue;
    out.push(line);
  }

  // Trim leading/trailing blank lines only.
  while (out.length > 0 && out[0].trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n");
}

function pageRange(sectionText: string): string | undefined {
  // The section span ends right before the NEXT score header, so its
  // trailing page marker belongs to the next section — strip it.
  const text = sectionText.replace(/--- Page \d+ ---\s*$/, "");
  const pages = [...text.matchAll(/--- Page (\d+) ---/g)].map(m =>
    Number.parseInt(m[1], 10));
  if (pages.length === 0) return undefined;
  return `${Math.min(...pages)}-${Math.max(...pages)}`;
}

function detectFacts(text: string): SourceClassificationInput {
  const scriptProseLength = text
    .split("\n")
    .filter(l => l.trim() !== "" && !/^--- Page/.test(l.trim()) && l.trim().length > 40)
    .reduce((s, l) => s + l.trim().length, 0);
  const hasScriptText = scriptProseLength > 500;
  return {
    hasScriptText,
    hasPublishedScore: CRITERION_RE.test(text) || SUB_MARK_RE.test(text),
    hasPublishedLevel: LEVEL_FACT_RE.test(text),
    hasTaskProvenance: TASK_RE.test(text),
    isTeachingCompilation:
      /SAMPLE\s+ESSAYS/i.test(text)
      || /[Vv]ocab/i.test(text),
    // Rubric documents are detected by HEADINGS, never by prose
    // mentions (candidate essays often discuss "marking schemes").
    isRubricDocument:
      !hasScriptText
      && (/^LEVEL DESCRIPTORS/mi.test(text)
        || /^MARKING SCHEME/mi.test(text)
        || /^LEVEL\s+DESCRIPTORS/mi.test(text)),
  };
}

// ============================================
// Ingestion
// ============================================

export interface HumanMarkerIngestionResult {
  fixtures: HumanMarkerCalibrationFixture[];
  manifest: HumanMarkerSourceManifestEntry[];
  quarantined: import("../types").QuarantineRecord[];
}

export interface HumanMarkerIngestionInput {
  sourcesDir: string;
}

/** SHA-256 over the EXACT source artifact bytes (lowercase hex). */
export function sha256OfBytes(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Ingest the owner-supplied human-marker sources. FAILS CLOSED:
 * every produced fixture must pass single + set validation, else
 * the whole ingestion throws. Deterministic and idempotent — no
 * timestamps or randomness in the output.
 */
export function ingestHumanMarkerSources(
  input: HumanMarkerIngestionInput,
): HumanMarkerIngestionResult {
  const fixtures: HumanMarkerCalibrationFixture[] = [];
  const manifest: HumanMarkerSourceManifestEntry[] = [];
  const quarantined: HumanMarkerIngestionResult["quarantined"] = [];

  for (const source of HUMAN_MARKER_SOURCES) {
    const pdfPath = join(input.sourcesDir, source.pdfFile);
    const txtPath = join(input.sourcesDir, source.txtFile);
    if (!existsSync(pdfPath)) {
      throw new Error(`Human-marker source PDF missing: ${pdfPath}`);
    }
    if (!existsSync(txtPath)) {
      throw new Error(`Human-marker extracted text missing: ${txtPath}`);
    }
    const rawPdf = readFileSync(pdfPath);
    const sourceHash = sha256OfBytes(rawPdf);
    const text = readFileSync(txtPath, "utf-8");

    const facts = detectFacts(text);
    const classification = classifyHumanMarkerSource(facts);
    const lines = text.split(/\r?\n/);

    let fixtureCount = 0;
    if (classification.sourceClass === "human-marker-scored") {
      const sections = splitSections(lines);
      for (const section of sections) {
        // Task provenance: the task line may appear BEFORE the score
        // header (e.g. "2018 DSE Part B Q5 ... Lv5** M1:21 M2:19")
        // or AFTER it (e.g. "Lv 5** C:7 L:7 O:7 / 2012 DSE Q9").
        let taskLine: string | null = null;
        for (const l of section.text.split("\n")) {
          if (TASK_RE.test(l.trim())) {
            taskLine = l.trim();
            break;
          }
        }
        if (taskLine === null) {
          for (let back = section.headerIndex - 1; back >= 0 && back >= section.headerIndex - 40; back -= 1) {
            const candidate = lines[back].trim();
            if (SCORE_HEADER_RE.test(candidate)) break; // never cross into another section
            if (TASK_RE.test(candidate)) {
              taskLine = candidate;
              break;
            }
          }
        }
        if (taskLine === null) {
          throw new Error(
            `${source.pdfFile}: scored section without task provenance — cannot ingest (fail closed)`,
          );
        }
        const taskMatch = taskLine.match(TASK_RE) as RegExpMatchArray;
        const year = Number.parseInt(taskMatch[1], 10);
        const part = taskMatch[2] ? `Part${taskMatch[2]}` : "PartB";
        const questionNo = taskMatch[3];
        const topic = taskMatch[4]?.trim();
        const taskId = `P2-${year}-${part}-Q${questionNo}`;
        const sectionId = `${part} Q${questionNo}`;

        const studentScript = extractStudentScript(section.text);
        if (studentScript.trim() === "") {
          throw new Error(
            `${source.pdfFile}: scored section ${sectionId} has no extractable script text (fail closed)`,
          );
        }

        const criterion = section.criterion;
        const subMarks = section.subMarks;
        const subScores: Array<{ label: string; value: number | string }> = [];
        if (subMarks) {
          subScores.push({ label: "M1", value: subMarks.m1 });
          subScores.push({ label: "M2", value: subMarks.m2 });
          subScores.push({
            label: "total",
            value: `${subMarks.totalNumerator}/${subMarks.totalDenominator}`,
          });
        }

        // Explicit overall score: accepted ONLY when labelled on the score
        // header line itself AND on a scale the source establishes
        // (/21 → clo-total, /100 → percentage). A number appearing
        // anywhere in prose is NEVER treated as a score. Malformed
        // labelled values are quarantined (fail closed) — never
        // repaired, never guessed.
        const overall = parseOverallScore(lines[section.headerIndex]);
        let overallScore: number | null = null;
        let overallBasis: "clo-total-0-21" | "percentage-0-100" | null = null;
        if (overall === "corrupt") {
          quarantined.push({
            id: `hm-${year}-${part}-q${questionNo}-corrupt-overall`,
            reason: "corrupt-overall-score",
            sourceFile: `materials/_hkeaa_scored_scripts/${source.pdfFile}`,
            detail:
              `Section ${sectionId} contains an overall-score label whose value could not `
              + "be parsed exactly — quarantined, never repaired or guessed",
          });
          continue;
        }
        if (overall !== null) {
          if (overall.basis !== null) {
            overallScore = overall.numerator;
            overallBasis = overall.basis;
          } else {
            // Unestablished scale: preserve verbatim, never normalize.
            subScores.push({
              label: "overall",
              value: `${overall.numerator}/${overall.denominator}`,
            });
          }
        }

        // A section whose ONLY published value is a level is LEVEL_ONLY
        // evidence — never human-marker evidence (never converted).
        if (!criterion && !subMarks && overallScore === null && subScores.length === 0) {
          quarantined.push({
            id: `hm-${year}-${part}-q${questionNo}-level-only`,
            reason: "unparseable-section",
            sourceFile: `materials/_hkeaa_scored_scripts/${source.pdfFile}`,
            detail:
              `Section ${sectionId} publishes only a level (${section.level}) — level-only evidence, not human-marker evidence`,
          });
          continue;
        }

        const fixturesForSection: HumanMarkerCalibrationFixture = {
          kind: "human-marker-calibration",
          id: buildHumanMarkerFixtureId({ year, paper: "Paper 2", taskId, sectionId }),
          schemaVersion: 1,
          studentScript,
          provenance: {
            sourceOrganization: "hkeaa",
            sourceDocument: source.pdfFile,
            sourceYear: year,
            paper: "Paper 2",
            taskId,
            sectionId,
            sourcePageRange: pageRange(section.text),
            sourceFile: `materials/_hkeaa_scored_scripts/${source.pdfFile}`,
            sourceHash,
            extractionMethod: "native-text",
            extractionQuality: "unknown",
            sourceAuthorityAssertion: { ...OWNER_ASSERTION },
          },
          rubricVersion: `DSE-P2-${year}`,
          markerPolicy: criterion
            ? "published marker criterion scores (C/L/O)"
            : "published marker double-marking sub-scores (M1/M2)",
          markerId: null,
          publishedLevel: section.level,
          publishedSubScores: subMarks ? subScores : undefined,
          scoreProvenance: {
            suppliedBy: "human-marker",
            overallScoreDirectlyScored: overallScore !== null,
            criterionScoresDirectlyScored: criterion !== null,
            overallScoreBasis: overallBasis,
            criterionScoreBasis: criterion ? "clo-0-7" : null,
            scoringMethod: overallScore !== null
              ? "published-marker-score (explicit labelled overall score)"
              : criterion
                ? "published-marker-score (C/L/O criterion scores)"
                : "published-marker-score (double marking M1/M2)",
          },
          overallScore,
          contentScore: criterion?.content ?? null,
          languageScore: criterion?.language ?? null,
          organizationScore: criterion?.organization ?? null,
          calibrationStatus: "ingested",
          notes:
            `Machine-extracted from owner-supplied source. `
            + `Published: Lv ${section.level}`
            + (criterion
              ? `; C:${criterion.content} L:${criterion.language} O:${criterion.organization}`
              : `; ${subMarks ? `M1:${subMarks.m1} M2:${subMarks.m2} ${subMarks.totalNumerator}/${subMarks.totalDenominator}` : ""}`)
            + (overallScore !== null ? `; Overall: ${overallScore} (scale ${overallBasis})` : "")
            + `. Topic: ${topic ?? "n/a"}. `
            + "Extraction quality 'unknown' — verbatim fidelity not manually reviewed.",
        };
        fixtures.push(fixturesForSection);
        fixtureCount += 1;
      }
    }

    const hasAnyPageContent = lines.some(l => l.trim() !== "" && !PAGE_RE.test(l.trim()));
    manifest.push({
      sourceFilename: source.pdfFile,
      sourceUrl: source.sourceUrl,
      sha256: sourceHash,
      acquisitionDate: ACQUISITION_DATE,
      authorityAssertion: { ...OWNER_ASSERTION },
      extractionMethod:
        classification.sourceClass === "human-marker-scored"
        || classification.sourceClass === "teaching-reference"
          ? "native-text"
          : hasAnyPageContent
            ? "native-text"
            : "image-only-no-text-layer",
      sourceClass: classification.sourceClass,
      fixtureCount,
      notes:
        classification.sourceClass === "teaching-reference"
          ? "Teaching/vocabulary compilation. Embedding copies of marker-scored "
            + "scripts does not make it calibration evidence; its script copies are "
            + "duplicates of the primary source and were NOT ingested."
          : classification.sourceClass === "non-authoritative-reference"
            ? classification.reasons.join("; ")
            : classification.reasons.join("; "),
    });
  }

  // Fail closed: validate every fixture and the whole evidence set.
  for (const fixture of fixtures) {
    const result = validateHumanMarkerFixture(fixture);
    if (!result.ok) {
      throw new Error(
        `Human-marker fixture ${fixture.id} invalid (fail closed): ${result.errors.join("; ")}`,
      );
    }
  }
  const setResult = validateHumanMarkerEvidenceSet(fixtures);
  if (!setResult.ok) {
    throw new Error(
      `Human-marker evidence set invalid (fail closed): ${setResult.errors.join("; ")}`,
    );
  }

  fixtures.sort((a, b) => a.id.localeCompare(b.id));
  quarantined.sort((a, b) => a.id.localeCompare(b.id));
  return { fixtures, manifest, quarantined };
}

// ============================================
// R3.10-H: Deterministic Evidence Inventory
// ============================================

/** One candidate record in the audit inventory (Phase 4). */
export interface EvidenceInventoryEntry {
  fixtureId: string | null;
  sourceFilename: string;
  sourceYear: number;
  paper: string;
  taskId: string;
  evidenceClass: string;
  hasVerbatimScript: boolean;
  hasNumericScore: boolean;
  exactPublishedScore: string | null;
  scoreScale: string | null;
  criterionAvailability: "content-language-organization" | "none";
  sourceHash: string;
}

/**
 * Build the deterministic audit inventory for every source + candidate.
 * Categories are NEVER collapsed: each record keeps its own class and
 * the summary reports every class separately. Inferred scores are
 * always 0 by construction (no code path derives them).
 */
export function buildEvidenceInventory(
  result: HumanMarkerIngestionResult,
): {
  sources: Array<{
    sourceFilename: string;
    sourceClass: string;
    sha256: string;
    fixtureCount: number;
    extractionMethod: string;
  }>;
  candidates: EvidenceInventoryEntry[];
  summary: {
    totalCandidates: number;
    acceptedFixtures: number;
    uniqueScripts: number;
    duplicateScripts: number;
    quarantinedScripts: number;
    inferredScores: number;
    byClass: {
      ACCEPT_OVERALL_SCORE: number;
      ACCEPT_CRITERION_ONLY: number;
      LEVEL_ONLY: number;
      NON_COMPARABLE_SCORE: number;
      TEACHING_REFERENCE: number;
      IMAGE_ONLY_UNREADABLE: number;
      CONFLICT: number;
    };
    /** Evidence ledger — categories are never collapsed into one count. */
    ledger: {
      DISCOVERED: number;
      ACCEPTED: number;
      REJECTED: number;
      QUARANTINED: number;
      DUPLICATE: number;
      CONFLICT: number;
      TEACHING_REFERENCE: number;
      CRITERION_ONLY: number;
      LEVEL_ONLY: number;
      NON_COMPARABLE: number;
      OVERALL_COMPARABLE: number;
    };
  };
} {
  const candidates: EvidenceInventoryEntry[] = [];
  for (const fixture of result.fixtures) {
    const hasCriterion =
      fixture.contentScore !== null
      || fixture.languageScore !== null
      || fixture.organizationScore !== null;
    const exactPublishedScore = fixture.overallScore !== null
      ? String(fixture.overallScore)
      : fixture.publishedSubScores
        ? fixture.publishedSubScores
          .filter(s => typeof s.value === "string" || typeof s.value === "number")
          .map(s => `${s.label}:${s.value}`)
          .join(" ")
        : null;
    candidates.push({
      fixtureId: fixture.id,
      sourceFilename: fixture.provenance.sourceDocument,
      sourceYear: fixture.provenance.sourceYear,
      paper: fixture.provenance.paper,
      taskId: fixture.provenance.taskId,
      evidenceClass: classifyHumanMarkerEvidence(fixture),
      hasVerbatimScript: fixture.studentScript.trim() !== "",
      hasNumericScore: fixture.overallScore !== null || hasCriterion
        || (fixture.publishedSubScores ?? []).some(s => typeof s.value === "number"),
      exactPublishedScore,
      scoreScale:
        fixture.scoreProvenance.overallScoreBasis
        ?? (hasCriterion ? "clo-0-7" : null),
      criterionAvailability: hasCriterion
        ? "content-language-organization"
        : "none",
      sourceHash: fixture.provenance.sourceHash,
    });
  }
  candidates.sort((a, b) => (a.fixtureId ?? "").localeCompare(b.fixtureId ?? ""));

  // 7-class summary — every class reported, never collapsed.
  const byClass = {
    ACCEPT_OVERALL_SCORE: 0,
    ACCEPT_CRITERION_ONLY: 0,
    LEVEL_ONLY: 0,
    NON_COMPARABLE_SCORE: 0,
    TEACHING_REFERENCE: 0,
    IMAGE_ONLY_UNREADABLE: 0,
    CONFLICT: 0,
  };
  for (const candidate of candidates) {
    switch (candidate.evidenceClass) {
      case "ACCEPT_OVERALL_SCORE": byClass.ACCEPT_OVERALL_SCORE += 1; break;
      case "ACCEPT_CRITERION_ONLY": byClass.ACCEPT_CRITERION_ONLY += 1; break;
      case "LEVEL_ONLY": byClass.LEVEL_ONLY += 1; break;
      case "NON_COMPARABLE_SCORE": byClass.NON_COMPARABLE_SCORE += 1; break;
      case "TEACHING_REFERENCE": byClass.TEACHING_REFERENCE += 1; break;
      case "IMAGE_ONLY_UNREADABLE": byClass.IMAGE_ONLY_UNREADABLE += 1; break;
      case "CONFLICT": byClass.CONFLICT += 1; break;
    }
  }
  for (const entry of result.manifest) {
    if (entry.sourceClass === "teaching-reference") {
      byClass.TEACHING_REFERENCE += 1; // document-level teaching evidence
    }
    if (entry.sourceClass === "non-authoritative-reference" && entry.fixtureCount === 0) {
      byClass.IMAGE_ONLY_UNREADABLE += 1; // image-only scans
    }
  }

  const uniqueIds = new Set(candidates.map(c => c.fixtureId));
  return {
    sources: result.manifest
      .map(m => ({
        sourceFilename: m.sourceFilename,
        sourceClass: m.sourceClass,
        sha256: m.sha256,
        fixtureCount: m.fixtureCount,
        extractionMethod: m.extractionMethod,
      }))
      .sort((a, b) => a.sourceFilename.localeCompare(b.sourceFilename)),
    candidates,
    summary: {
      totalCandidates: candidates.length + result.quarantined.length,
      acceptedFixtures: candidates.length,
      uniqueScripts: uniqueIds.size,
      duplicateScripts: 0, // deduped during ingestion; never counted twice
      quarantinedScripts: result.quarantined.length,
      inferredScores: 0, // invariant: no derivation path exists
      byClass,
      ledger: {
        DISCOVERED: candidates.length + result.quarantined.length,
        ACCEPTED: candidates.length,
        REJECTED: 0,
        QUARANTINED: result.quarantined.length,
        DUPLICATE: 0,
        CONFLICT: byClass.CONFLICT,
        TEACHING_REFERENCE: byClass.TEACHING_REFERENCE,
        CRITERION_ONLY: byClass.ACCEPT_CRITERION_ONLY,
        LEVEL_ONLY: byClass.LEVEL_ONLY,
        NON_COMPARABLE: byClass.NON_COMPARABLE_SCORE,
        OVERALL_COMPARABLE: byClass.ACCEPT_OVERALL_SCORE,
      },
    },
  };
}

// ============================================
// Deterministic output writer (immutable artifacts)
// ============================================

export interface HumanMarkerWriteOutcome {
  written: string[];
  unchanged: string[];
  conflicts: string[];
}

/**
 * Write fixtures + manifest fail-closed with the SAME immutability
 * contract as the HKEAA authoritative ingestion: identical content
 * is a no-op; different content under the same id conflicts (never
 * mutated) unless forceNewVersion creates a new artifact.
 */
export function writeHumanMarkerIngestionOutput(
  fixtures: HumanMarkerCalibrationFixture[],
  manifest: HumanMarkerSourceManifestEntry[],
  quarantined: HumanMarkerIngestionResult["quarantined"],
  options: { outDir: string; forceNewVersion?: boolean; dryRun?: boolean },
): HumanMarkerWriteOutcome {
  const outcome: HumanMarkerWriteOutcome = { written: [], unchanged: [], conflicts: [] };
  const outDir = options.outDir;
  if (!options.dryRun) mkdirSync(outDir, { recursive: true });
  const existing = new Set(
    existsSync(outDir) ? readdirSync(outDir).filter(f => f.endsWith(".json")) : [],
  );

  const writeOne = (fileName: string, content: unknown): void => {
    const body = `${JSON.stringify(content, null, 2)}\n`;
    const target = join(outDir, fileName);
    if (existing.has(fileName)) {
      const onDisk = readFileSync(target, "utf-8");
      if (onDisk === body) {
        outcome.unchanged.push(fileName);
        return;
      }
      if (options.forceNewVersion) {
        let version = 2;
        let candidate = fileName.replace(/\.json$/, `-v${version}.json`);
        while (existing.has(candidate)) {
          version += 1;
          candidate = fileName.replace(/\.json$/, `-v${version}.json`);
        }
        if (!options.dryRun) writeFileSync(join(outDir, candidate), body, "utf-8");
        outcome.written.push(candidate);
        existing.add(candidate);
      } else {
        outcome.conflicts.push(fileName);
      }
      return;
    }
    if (!options.dryRun) writeFileSync(target, body, "utf-8");
    outcome.written.push(fileName);
    existing.add(fileName);
  };

  for (const fixture of fixtures) writeOne(`${fixture.id}.json`, fixture);
  writeOne("manifest.json", {
    schemaVersion: 1,
    description:
      "External-source manifest for human-marker evidence. Source authority is an "
      + "OWNER ASSERTION, not an independently verified fact. The sourceHash is the "
      + "SHA-256 of the EXACT original source artifact bytes.",
    sources: manifest,
  });
  writeOne("inventory.json", {
    schemaVersion: 1,
    description:
      "R3.10-H deterministic evidence inventory. Each candidate keeps its own "
      + "evidence class — categories are never collapsed.",
    ...buildEvidenceInventory({ fixtures, manifest, quarantined }),
  });
  writeOne("quarantine.json", {
    schemaVersion: 1,
    description: "Sections that failed evidence classification — quarantined, never guessed.",
    records: quarantined,
  });

  outcome.written = [...new Set(outcome.written)].sort();
  outcome.unchanged = [...new Set(outcome.unchanged)].sort();
  outcome.conflicts = [...new Set(outcome.conflicts)].sort();
  return outcome;
}
