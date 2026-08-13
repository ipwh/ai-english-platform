// ============================================
// R3.10-F: Ingestion Output Writer (immutable artifacts)
//
// Serializes ingested fixtures to deterministic JSON files.
//
// Immutability contract:
//   - an existing artifact is NEVER mutated in place
//   - identical content re-write is a no-op (idempotent)
//   - different content under the same id FAILS CLOSED unless
//     forceNewVersion is set, in which case a NEW versioned
//     artifact id is produced and the original is untouched
// ============================================

import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import type {
  AuthoritativeCalibrationFixture,
  OfficialRubricReference,
  QuarantineRecord,
} from "../types";

export interface WriteOutcome {
  written: string[];
  unchanged: string[];
  conflicts: string[];
}

export interface WriteOptions {
  outDir: string;
  /** When true, content conflicts create a NEW versioned artifact id. */
  forceNewVersion?: boolean;
  /** When true, report the plan but write nothing. */
  dryRun?: boolean;
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Deterministic file name for a fixture id. */
function fixtureFileName(id: string): string {
  return `${id}.json`;
}

function existingFiles(outDir: string): Set<string> {
  if (!existsSync(outDir)) return new Set();
  return new Set(readdirSync(outDir).filter(f => f.endsWith(".json")));
}

function nextVersionName(id: string, taken: Set<string>, outDir: string): string {
  const files = existingFiles(outDir);
  let version = 2;
  let candidate = `${id}-v${version}.json`;
  while (files.has(candidate) || taken.has(candidate)) {
    version += 1;
    candidate = `${id}-v${version}.json`;
  }
  return candidate;
}

/**
 * Write artifacts fail-closed. Returns per-file outcomes. Throws only
 * on filesystem errors; conflicts are reported (and handled) in the
 * outcome object so callers can decide the process exit code.
 */
export function writeIngestionOutput(
  fixtures: AuthoritativeCalibrationFixture[],
  references: OfficialRubricReference[],
  quarantined: QuarantineRecord[],
  options: WriteOptions,
): WriteOutcome {
  const outcome: WriteOutcome = { written: [], unchanged: [], conflicts: [] };
  const outDir = options.outDir;
  const taken = new Set<string>();

  if (!options.dryRun) {
    mkdirSync(outDir, { recursive: true });
  }
  const files = existingFiles(outDir);

  const writeOne = (id: string, content: unknown): void => {
    const fileName = fixtureFileName(id);
    const body = serialize(content);
    const target = join(outDir, fileName);

    if (files.has(fileName)) {
      const existing = readFileSync(target, "utf-8");
      if (existing === body) {
        outcome.unchanged.push(fileName);
        return;
      }
      // Content conflict: never mutate in place.
      if (options.forceNewVersion) {
        const versioned = nextVersionName(id, taken, outDir);
        if (!options.dryRun) writeFileSync(join(outDir, versioned), body, "utf-8");
        outcome.written.push(versioned);
        taken.add(versioned);
      } else {
        outcome.conflicts.push(fileName);
      }
      return;
    }
    if (!options.dryRun) writeFileSync(target, body, "utf-8");
    outcome.written.push(fileName);
    taken.add(fileName);
  };

  for (const fixture of fixtures) writeOne(fixture.id, fixture);
  for (const reference of references) writeOne(reference.id, reference);

  const manifest = {
    schemaVersion: 1,
    description:
      "Authoritative HKEAA calibration artifacts. IMMUTABLE after ingestion — "
      + "if the source changes, a new versioned artifact is created; existing "
      + "artifacts are never mutated.",
    fixtureIds: fixtures.map(f => f.id),
    rubricReferenceIds: references.map(r => r.id),
    fixtureCount: fixtures.length,
    rubricReferenceCount: references.length,
  };
  writeOne("manifest", manifest);

  const quarantine = {
    schemaVersion: 1,
    description:
      "Source samples that could not be verified as authoritative calibration "
      + "fixtures. Quarantined, never guessed.",
    records: quarantined,
  };
  writeOne("quarantine", quarantine);

  // Determinism guard: no file may be both written and conflicted.
  outcome.written = [...new Set(outcome.written)].sort();
  outcome.unchanged = [...new Set(outcome.unchanged)].sort();
  outcome.conflicts = [...new Set(outcome.conflicts)].sort();
  return outcome;
}
