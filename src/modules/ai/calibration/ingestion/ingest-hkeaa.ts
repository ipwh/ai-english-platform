// ============================================
// R3.10-F: HKEAA Ingestion Orchestrator
//
// Converts verified HKEAA source material (extracted texts) into
// structured calibration fixtures and official rubric references.
//
// Guarantees:
//   - DETERMINISTIC: same inputs → identical outputs (no
//     timestamps, no randomness, fixed ordering).
//   - IDEMPOTENT: re-running over unchanged sources produces the
//     exact same artifacts.
//   - PROVENANCE-PRESERVING: every fixture carries source document,
//     year, paper, task/section reference, and a SHA-256 source hash.
//   - FAIL CLOSED: any fixture that fails validation aborts the
//     whole ingestion (no partial, unvalidated outputs).
//   - NO LLM, NO DATABASE, NO FABRICATED SCORES.
// ============================================

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  AuthoritativeCalibrationFixture,
  OfficialRubricReference,
  QuarantineRecord,
} from "../types";
import { validateAuthoritativeFixture, computeProvenanceHash } from "../provenance";
import { parseExemplarBooklet } from "./parse-exemplar-booklet";
import { parseLevelDescriptors } from "./parse-level-descriptors";
import { parsePaper4Samples } from "./parse-paper4-samples";

export interface IngestionInput {
  /** Directory containing the extracted text files (materials/_extracted). */
  materialsDir: string;
  /** Directory containing the level-descriptor extractions (materials/_hkeaa_descriptors). */
  descriptorsDir: string;
}

export interface IngestionResult {
  fixtures: AuthoritativeCalibrationFixture[];
  rubricReferences: OfficialRubricReference[];
  quarantined: QuarantineRecord[];
  duplicatesDetected: number;
}

/** Fixed source file inventory (deterministic — no directory scanning). */
const BOOKLET_FILES = [
  {
    file: "Paper 2 Samples_HKDSE English 2020-2025.pdf.txt",
    document: "Paper 2 Samples_HKDSE English 2020-2025.pdf",
    paper: "Paper 2" as const,
  },
  {
    file: "Paper 1 Samples_HKDSE English 2020-2025.pdf.txt",
    document: "Paper 1 Samples_HKDSE English 2020-2025.pdf",
    paper: "Paper 1" as const,
  },
  {
    file: "Paper 3 Samples_HKDSE English 2020-2025.pdf.txt",
    document: "Paper 3 Samples_HKDSE English 2020-2025.pdf",
    paper: "Paper 3" as const,
  },
];

const PAPER4_FILE = {
  file: "Paper 4 Introduction Samples_HKDSE English 2020-2025.pdf.txt",
  document: "Paper 4 Introduction Samples_HKDSE English 2020-2025.pdf",
};

const DESCRIPTOR_FILES = [
  {
    file: "LevelDescriptors-ENG-Writing.pdf.txt",
    document: "LevelDescriptors-ENG-Writing.pdf",
    scope: "level-descriptors-writing" as const,
    paper: "Paper 2" as const,
    splitDimensions: true,
  },
  {
    file: "LevelDescriptors-ENG-Subject.pdf.txt",
    document: "LevelDescriptors-ENG-Subject.pdf",
    scope: "level-descriptors-subject" as const,
    paper: "General" as const,
    splitDimensions: false,
  },
  {
    file: "LevelDescriptors-ENG-Reading.pdf.txt",
    document: "LevelDescriptors-ENG-Reading.pdf",
    scope: "level-descriptors-reading" as const,
    paper: "Paper 1" as const,
    splitDimensions: false,
  },
  {
    file: "LevelDescriptors-ENG-Listening.pdf.txt",
    document: "LevelDescriptors-ENG-Listening.pdf",
    scope: "level-descriptors-listening" as const,
    paper: "Paper 3" as const,
    splitDimensions: false,
  },
  {
    file: "LevelDescriptors-ENG-Speaking.pdf.txt",
    document: "LevelDescriptors-ENG-Speaking.pdf",
    scope: "level-descriptors-speaking" as const,
    paper: "Paper 4" as const,
    splitDimensions: false,
  },
];

const MARKING_SCHEME = {
  file: "2020-2025 DSE English past paper_Paper 2_2020-2025 DSE ENG_Paper 2_Marking Scheme.pdf.txt",
  document: "2020-2025 DSE English past paper_Paper 2_2020-2025 DSE ENG_Paper 2_Marking Scheme.pdf",
};

function readRequired(dir: string, file: string): string {
  const p = join(dir, file);
  if (!existsSync(p)) {
    throw new Error(`Calibration source file missing: ${p}`);
  }
  return readFileSync(p, "utf-8");
}

/**
 * Ingest all HKEAA source material. Throws on validation failure
 * (fail closed) — callers must not emit partial outputs.
 */
export function ingestHKEAAMaterials(input: IngestionInput): IngestionResult {
  const fixtures: AuthoritativeCalibrationFixture[] = [];
  const rubricReferences: OfficialRubricReference[] = [];
  const quarantined: QuarantineRecord[] = [];

  // 1. Exemplar booklets (Paper 1 / 2 / 3).
  for (const src of BOOKLET_FILES) {
    const text = readRequired(input.materialsDir, src.file);
    const parsed = parseExemplarBooklet(text, {
      paper: src.paper,
      sourceDocument: src.document,
      sourceFile: join("materials", "_extracted", src.file),
    });
    fixtures.push(...parsed.fixtures);
    quarantined.push(...parsed.quarantined);
  }

  // 2. Paper 4 video-based samples.
  {
    const text = readRequired(input.materialsDir, PAPER4_FILE.file);
    const parsed = parsePaper4Samples(text, {
      sourceDocument: PAPER4_FILE.document,
      sourceFile: join("materials", "_extracted", PAPER4_FILE.file),
    });
    fixtures.push(...parsed.fixtures);
    quarantined.push(...parsed.quarantined);
  }

  // 3. Official level descriptors.
  for (const src of DESCRIPTOR_FILES) {
    const text = readRequired(input.descriptorsDir, src.file);
    const parsed = parseLevelDescriptors(text, {
      scope: src.scope,
      paper: src.paper,
      sourceDocument: src.document,
      sourceFile: join("materials", "_hkeaa_descriptors", src.file),
      sourceYear: null,
      splitDimensions: src.splitDimensions,
    });
    rubricReferences.push(...parsed.references);
    quarantined.push(...parsed.quarantined);
  }

  // 4. Paper 2 marking scheme — document-level reference (multi-column
  //    OCR is not split into per-mark bands; coarse truth only).
  {
    const text = readRequired(input.materialsDir, MARKING_SCHEME.file);
    const sourceHash = computeProvenanceHash([MARKING_SCHEME.document, text]);
    rubricReferences.push({
      kind: "official-rubric-reference",
      id: "hkeaa-ms-paper2-2020-2025",
      schemaVersion: 1,
      sourceOrganization: "hkeaa",
      sourceDocument: MARKING_SCHEME.document,
      sourceYear: null,
      paper: "Paper 2",
      rubricScope: "marking-scheme-paper2",
      level: null,
      dimension: null,
      mark: null,
      descriptorText: text.trim(),
      sourceFile: join("materials", "_extracted", MARKING_SCHEME.file),
      sourceHash,
    });
  }

  // 5. Fail-closed validation of every authoritative fixture.
  const failures: string[] = [];
  for (const fixture of fixtures) {
    const result = validateAuthoritativeFixture(fixture);
    if (!result.ok) {
      failures.push(`${fixture.id}: ${result.errors.join("; ")}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Calibration ingestion validation FAILED (fail closed):\n  ${failures.join("\n  ")}`,
    );
  }

  // 6. Deterministic ordering.
  fixtures.sort((a, b) => a.id.localeCompare(b.id));
  rubricReferences.sort((a, b) => a.id.localeCompare(b.id));
  quarantined.sort((a, b) => a.id.localeCompare(b.id));

  const duplicatesDetected = quarantined.filter(
    q => q.reason === "duplicate-source-sample",
  ).length;

  return { fixtures, rubricReferences, quarantined, duplicatesDetected };
}
