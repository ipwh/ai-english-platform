// ============================================
// R3.10-F: HKEAA Calibration Ingestion CLI
//
// Usage:
//   npx tsx scripts/ingest-calibration.ts
//   npx tsx scripts/ingest-calibration.ts --dry-run
//   npx tsx scripts/ingest-calibration.ts --force-new-version
//
// Converts verified HKEAA source material into immutable
// authoritative calibration fixtures. Deterministic and
// idempotent: re-running over unchanged sources is a no-op.
//
// Exit codes:
//   0 — success (written or unchanged)
//   1 — validation failure / conflict (fail closed)
// ============================================

import * as path from "path";
import {
  ingestHKEAAMaterials,
  writeIngestionOutput,
} from "../src/modules/ai/calibration";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const forceNewVersion = args.includes("--force-new-version");

const MATERIALS_DIR = path.resolve(__dirname, "../materials/_extracted");
const DESCRIPTORS_DIR = path.resolve(__dirname, "../materials/_hkeaa_descriptors");
const OUT_DIR = path.resolve(
  __dirname,
  "../src/modules/ai/calibration/fixtures/hkeaa",
);

function main(): number {
  console.log("📚 HKEAA Calibration Ingestion");
  console.log(`   Materials: ${MATERIALS_DIR}`);
  console.log(`   Descriptors: ${DESCRIPTORS_DIR}`);
  console.log(`   Output: ${OUT_DIR}`);
  console.log(`   Dry run: ${dryRun}  Force new version: ${forceNewVersion}`);
  console.log("");

  let result;
  try {
    result = ingestHKEAAMaterials({
      materialsDir: MATERIALS_DIR,
      descriptorsDir: DESCRIPTORS_DIR,
    });
  } catch (err) {
    console.error(`❌ Ingestion FAILED (fail closed): ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  console.log(`   Authoritative fixtures: ${result.fixtures.length}`);
  console.log(`   Official rubric references: ${result.rubricReferences.length}`);
  console.log(`   Quarantined samples: ${result.quarantined.length}`);
  console.log(`   Duplicate source samples detected: ${result.duplicatesDetected}`);
  console.log("");

  const outcome = writeIngestionOutput(
    result.fixtures,
    result.rubricReferences,
    result.quarantined,
    { outDir: OUT_DIR, forceNewVersion, dryRun },
  );

  console.log(`   Written: ${outcome.written.length}`);
  console.log(`   Unchanged (idempotent): ${outcome.unchanged.length}`);
  if (outcome.conflicts.length > 0) {
    console.error("❌ CONTENT CONFLICTS (immutability violation — nothing was mutated):");
    for (const file of outcome.conflicts) console.error(`   - ${file}`);
    console.error(
      "   The source material changed since the artifacts were ingested. "
      + "Existing artifacts were NOT modified. Re-run with --force-new-version "
      + "to create new versioned artifacts, or restore the original source.",
    );
    return 1;
  }

  if (dryRun) console.log("   (dry run — nothing written)");
  else console.log("✅ Ingestion complete.");
  return 0;
}

process.exit(main());
