// ============================================
// R3.10-F: Level Descriptor Parser
//
// Parses HKEAA official Level Descriptor PDFs into immutable
// OfficialRubricReference records. Verbatim descriptor text only —
// no interpretation, no rewriting, no scoring.
//
// The Writing descriptors use dimension headers ("Content",
// "Language and style", "Organization"). When those headers are
// present the per-dimension references are emitted; otherwise a
// single aggregate reference per level is emitted (coarser truth,
// never guessed splits).
// ============================================

import type {
  HKEAALevel,
  OfficialRubricReference,
  QuarantineRecord,
  RubricScope,
} from "../types";
import { computeProvenanceHash } from "../provenance";

export interface DescriptorParserMeta {
  scope: RubricScope;
  paper: OfficialRubricReference["paper"];
  sourceDocument: string;
  sourceFile: string;
  /** Published year when stated in the document, else null. */
  sourceYear: number | null;
  /** Whether to attempt Content / Language / Organization splitting. */
  splitDimensions: boolean;
}

export interface ParsedDescriptors {
  references: OfficialRubricReference[];
  quarantined: QuarantineRecord[];
}

const LEVEL_HEADER_RE = /^\s*Level\s+([1-5])\s*$/;
const DIMENSION_HEADER_RE = /^\s*(Content|Language and style|Organization)\s*$/;

function levelName(level: HKEAALevel): string {
  return `level${level}`;
}

/**
 * Parse one level-descriptor document into rubric references.
 * Sections that cannot be split into levels are quarantined.
 */
export function parseLevelDescriptors(
  text: string,
  meta: DescriptorParserMeta,
): ParsedDescriptors {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const references: OfficialRubricReference[] = [];
  const quarantined: QuarantineRecord[] = [];

  // Find level section boundaries.
  const boundaries: Array<{ line: number; level: HKEAALevel }> = [];
  lines.forEach((line, idx) => {
    const m = line.match(LEVEL_HEADER_RE);
    if (m) boundaries.push({ line: idx, level: Number.parseInt(m[1], 10) as HKEAALevel });
  });

  if (boundaries.length === 0) {
    quarantined.push({
      id: `descriptors-${meta.scope}-no-levels`,
      reason: "unparseable-section",
      sourceFile: meta.sourceFile,
      detail: "No level headers found in descriptor document",
    });
    return { references, quarantined };
  }

  for (let i = 0; i < boundaries.length; i += 1) {
    const { line, level } = boundaries[i];
    const endLine = i + 1 < boundaries.length ? boundaries[i + 1].line : lines.length;
    const sectionLines = lines.slice(line, endLine);
    const sectionText = sectionLines.join("\n").trim();
    const baseId = `hkeaa-${meta.scope.replace(/-/g, "")}-${levelName(level)}`;

    const sourceHash = computeProvenanceHash([
      meta.sourceDocument,
      meta.scope,
      `Level ${level}`,
      sectionText,
    ]);

    const common = {
      kind: "official-rubric-reference" as const,
      schemaVersion: 1 as const,
      sourceOrganization: "hkeaa" as const,
      sourceDocument: meta.sourceDocument,
      sourceYear: meta.sourceYear,
      paper: meta.paper,
      rubricScope: meta.scope,
      sourceFile: meta.sourceFile,
      sourceHash,
    };

    if (!meta.splitDimensions) {
      references.push({
        ...common,
        id: baseId,
        level,
        dimension: null,
        mark: null,
        descriptorText: sectionText,
      });
      continue;
    }

    // Split into Content / Language and style / Organization.
    const dimStarts: Array<{ idx: number; name: "content" | "language" | "organization" }> = [];
    sectionLines.forEach((l, idx) => {
      const m = l.match(DIMENSION_HEADER_RE);
      if (!m) return;
      const name = m[1] === "Content"
        ? "content"
        : m[1] === "Language and style"
          ? "language"
          : "organization";
      dimStarts.push({ idx, name });
    });

    const unique = dimStarts.filter(
      (d, i) => i === 0 || d.name !== dimStarts[i - 1].name,
    );

    if (unique.length !== 3) {
      // Cannot verify a complete C/L/O split — emit aggregate, never guess.
      references.push({
        ...common,
        id: baseId,
        level,
        dimension: null,
        mark: null,
        descriptorText: sectionText,
      });
      continue;
    }

    for (let d = 0; d < unique.length; d += 1) {
      const start = unique[d].idx;
      const end = d + 1 < unique.length ? unique[d + 1].idx : sectionLines.length;
      const dimText = sectionLines.slice(start, end).join("\n").trim();
      references.push({
        ...common,
        id: `${baseId}-${unique[d].name}`,
        level,
        dimension: unique[d].name,
        mark: null,
        descriptorText: dimText,
      });
    }
  }

  references.sort((a, b) => a.id.localeCompare(b.id));
  return { references, quarantined };
}
