// ============================================
// R3.10-G: Human-Marker Evidence Ingestion CLI
//
// Usage:
//   npx tsx scripts/ingest-human-marker.ts
//   npx tsx scripts/ingest-human-marker.ts --dry-run
//   npx tsx scripts/ingest-human-marker.ts --force-new-version
//
// Transforms the owner-supplied scored-script PDFs into
// HumanMarkerCalibrationFixture JSON. Deterministic and idempotent.
// Source authority is an OWNER ASSERTION recorded in the manifest —
// never a substitute for the strict fixture validation.
//
// Exit codes: 0 success / 1 failure (fail closed)
// ============================================

import * as path from "path";
import {
  ingestHumanMarkerSources,
  writeHumanMarkerIngestionOutput,
} from "../src/modules/ai/calibration";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const forceNewVersion = args.includes("--force-new-version");

const SOURCES_DIR = path.resolve(__dirname, "../materials/_hkeaa_scored_scripts");
const OUT_DIR = path.resolve(
  __dirname,
  "../src/modules/ai/calibration/fixtures/human-marker",
);

function main(): number {
  console.log("✍️  Human-Marker Evidence Ingestion");
  console.log(`   Sources: ${SOURCES_DIR}`);
  console.log(`   Output: ${OUT_DIR}`);
  console.log(`   Dry run: ${dryRun}  Force new version: ${forceNewVersion}`);
  console.log("");

  let result;
  try {
    result = ingestHumanMarkerSources({ sourcesDir: SOURCES_DIR });
  } catch (err) {
    console.error(`❌ Ingestion FAILED (fail closed): ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  console.log(`   Human-marker fixtures: ${result.fixtures.length}`);
  console.log(`   Quarantined sections: ${result.quarantined.length}`);
  for (const entry of result.manifest) {
    console.log(
      `   - ${entry.sourceFilename}: class=${entry.sourceClass} fixtures=${entry.fixtureCount} sha256=${entry.sha256.slice(0, 12)}…`,
    );
  }
  console.log("");

  const outcome = writeHumanMarkerIngestionOutput(
    result.fixtures,
    result.manifest,
    result.quarantined,
    { outDir: OUT_DIR, forceNewVersion, dryRun },
  );

  console.log(`   Written: ${outcome.written.length}`);
  console.log(`   Unchanged (idempotent): ${outcome.unchanged.length}`);
  if (outcome.conflicts.length > 0) {
    console.error("❌ CONTENT CONFLICTS (immutability violation — nothing was mutated):");
    for (const file of outcome.conflicts) console.error(`   - ${file}`);
    console.error(
      "   Existing artifacts were NOT modified. Re-run with --force-new-version "
      + "to create new versioned artifacts, or restore the original source.",
    );
    return 1;
  }

  if (dryRun) console.log("   (dry run — nothing written)");
  else console.log("✅ Ingestion complete.");
  return 0;
}

process.exit(main());
