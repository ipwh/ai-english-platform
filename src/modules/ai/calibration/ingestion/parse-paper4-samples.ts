// ============================================
// R3.10-F: Paper 4 Sample Parser
//
// The official Paper 4 sample document publishes video-based
// candidate performances with assigned levels (e.g.
// "Candidate A – L5"). No transcript exists — performance is
// video-only — so records are level-only calibration fixtures.
//
// Table format (verified from the extraction):
//   Video  Candidate / Level of Performance  Question Paper / Version
//   1 Candidate A – L5
//   Candidate B – L2
//   Candidate C – L2
//   Candidate D – L4 2024 – Eng Lang Paper 4 – 1.1
//   Digital museum
// The video number prefixes the FIRST candidate row only; the
// following candidate rows belong to the same video.
// ============================================

import type {
  AuthoritativeCalibrationFixture,
  HKEAALevel,
  QuarantineRecord,
} from "../types";
import { computeProvenanceHash } from "../provenance";

export interface Paper4ParserMeta {
  sourceDocument: string;
  sourceFile: string;
}

export interface ParsedPaper4 {
  fixtures: AuthoritativeCalibrationFixture[];
  quarantined: QuarantineRecord[];
}

/** "1 Candidate A – L5" (numbered first row of a video table). */
const NUMBERED_CANDIDATE_RE = /^(\d+)\s+Candidate\s+([A-D])\s*[–-]\s*L([1-5])\b/i;
/**
 * "Candidate B – L2" (continuation row). Not end-anchored: the last
 * candidate's row carries the "2024 – Eng Lang Paper 4 – 1.1" suffix.
 */
const PLAIN_CANDIDATE_RE = /^Candidate\s+([A-D])\s*[–-]\s*L([1-5])\b/i;

/**
 * Parse Paper 4 sample document into per-candidate level-only
 * fixtures. Ambiguous years or unparseable sections are quarantined.
 */
export function parsePaper4Samples(
  text: string,
  meta: Paper4ParserMeta,
): ParsedPaper4 {
  const normalized = text.replace(/\r\n?/g, "\n");
  const fixtures: AuthoritativeCalibrationFixture[] = [];
  const quarantined: QuarantineRecord[] = [];

  const yearIntros = [...normalized.matchAll(/for the (20 ?\d ?\d) samples of performance/gi)]
    .map(m => ({
      year: Number.parseInt(m[1].replace(/\s+/g, ""), 10),
      index: m.index ?? 0,
    }))
    .filter(m => Number.isInteger(m.year) && m.year >= 2010 && m.year <= 2100);

  if (yearIntros.length === 0) {
    quarantined.push({
      id: "p4-unknown-year",
      reason: "ambiguous-year",
      sourceFile: meta.sourceFile,
      detail: "No Paper 4 year introduction found in source text",
    });
    return { fixtures, quarantined };
  }

  for (let i = 0; i < yearIntros.length; i += 1) {
    const { year, index } = yearIntros[i];
    const end = i + 1 < yearIntros.length ? yearIntros[i + 1].index : normalized.length;
    const yearText = normalized.slice(index, end);

    let currentVideo: number | null = null;
    const candidatesInYear: string[] = [];

    for (const line of yearText.split("\n")) {
      const numbered = line.match(NUMBERED_CANDIDATE_RE);
      if (numbered) {
        currentVideo = Number.parseInt(numbered[1], 10);
        candidatesInYear.push(`${numbered[2]}:${numbered[3]}`);
        const id = `hkeaa-p4-${year}-v${currentVideo}-candidate${numbered[2]}`;
        fixtures.push(makeFixture(meta, year, currentVideo, numbered[2], Number.parseInt(numbered[3], 10) as HKEAALevel, id));
        continue;
      }
      const plain = line.match(PLAIN_CANDIDATE_RE);
      if (plain && currentVideo !== null) {
        candidatesInYear.push(`${plain[1]}:${plain[2]}`);
        const id = `hkeaa-p4-${year}-v${currentVideo}-candidate${plain[1]}`;
        fixtures.push(makeFixture(meta, year, currentVideo, plain[1], Number.parseInt(plain[2], 10) as HKEAALevel, id));
      }
    }

    if (candidatesInYear.length === 0) {
      quarantined.push({
        id: `p4-${year}-no-candidates`,
        reason: "unparseable-section",
        sourceFile: meta.sourceFile,
        detail: `Year ${year} references videos but no candidate levels could be parsed`,
      });
    }
  }

  // Global duplicate check (same year + video + candidate appearing twice).
  const seen = new Set<string>();
  const deduped: AuthoritativeCalibrationFixture[] = [];
  for (const fixture of fixtures) {
    const key = `${fixture.provenance.sourceYear}|${fixture.provenance.taskId}|${fixture.provenance.sectionId}`;
    if (seen.has(key)) {
      quarantined.push({
        id: `${fixture.id}-duplicate`,
        reason: "duplicate-source-sample",
        sourceFile: meta.sourceFile,
        detail: `Duplicate of ${fixture.id} in source material`,
      });
      continue;
    }
    seen.add(key);
    deduped.push(fixture);
  }

  deduped.sort((a, b) => a.id.localeCompare(b.id));
  quarantined.sort((a, b) => a.id.localeCompare(b.id));
  return { fixtures: deduped, quarantined };
}

function makeFixture(
  meta: Paper4ParserMeta,
  year: number,
  video: number,
  candidate: string,
  level: HKEAALevel,
  id: string,
): AuthoritativeCalibrationFixture {
  const taskId = `P4-${year}-V${video}`;
  const sourceHash = computeProvenanceHash([
    meta.sourceDocument,
    taskId,
    `Candidate ${candidate}`,
    `L${level}`,
  ]);
  return {
    kind: "authoritative-calibration",
    id,
    schemaVersion: 1,
    provenance: {
      sourceOrganization: "hkeaa",
      sourceDocument: meta.sourceDocument,
      sourceYear: year,
      paper: "Paper 4",
      taskId,
      sectionId: `Video ${video} — Candidate ${candidate}`,
      sourceFile: meta.sourceFile,
      sourceHash,
      extractionStatus: "video-no-transcript",
    },
    studentScript: null,
    publishedLevel: level,
    publishedOverallScore: null,
    publishedContentScore: null,
    publishedLanguageScore: null,
    publishedOrganizationScore: null,
    criterionScoresOfficiallyPublished: false,
    rubricVersion: "HKEAA-official-exemplar-levels",
    calibrationStatus: "ingested-level-only",
    notes:
      "Machine-extracted from official Paper 4 sample document. "
      + "Performance is video-only (no transcript); officially assigned level recorded. "
      + "No numeric marks are published for this sample.",
  };
}
