// ============================================
// R3.10-K Phase 9 — Adjudication Intake CLI
//
// Usage:
//   npx tsx scripts/adjudication-intake.ts --fixture-dir <dir> --fixture <id>
//     --adjudicator-id <id> --adjudicated-at <ISO> --reason <text>
//     --resolution <text> [--resolved-scores <json>]
//
// Appends/replaces ONLY the adjudication record. Original markerScores
// and top-level scores are NEVER mutated. A resolved adjudication is
// immutable.
// ============================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  applyAdjudication,
  type AdjudicationRecord,
  type HumanMarkerCalibrationFixture,
} from "../src/modules/ai/calibration";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

function main(): number {
  const dir = arg("fixture-dir");
  const fixtureId = arg("fixture");
  const adjudicatorId = arg("adjudicator-id");
  const adjudicatedAt = arg("adjudicated-at");
  const reason = arg("reason");
  const resolution = arg("resolution");
  if (!dir || !fixtureId || !adjudicatorId || !adjudicatedAt) {
    console.error("Usage: adjudication-intake.ts --fixture-dir <dir> --fixture <id> --adjudicator-id <id> --adjudicated-at <ISO> --reason <text> --resolution <text> [--resolved-scores <json>]");
    return 1;
  }
  const file = join(dir, `${fixtureId}.json`);
  if (!existsSync(file)) {
    console.error(`❌ fixture not found: ${file}`);
    return 1;
  }
  const fixture = JSON.parse(readFileSync(file, "utf-8")) as HumanMarkerCalibrationFixture;
  const resolvedScoresRaw = arg("resolved-scores");
  let resolvedScores: AdjudicationRecord["resolvedScores"];
  if (resolvedScoresRaw) {
    resolvedScores = JSON.parse(resolvedScoresRaw);
  }
  const record: AdjudicationRecord = {
    status: "resolved",
    adjudicatorId,
    resolvedAt: adjudicatedAt,
    notes: null,
    reason,
    resolution,
    resolvedScores,
  };
  try {
    const updated = applyAdjudication(fixture, record);
    writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
    console.log(`✅ Adjudication recorded for ${fixtureId} — original marker scores preserved.`);
    return 0;
  } catch (err) {
    console.error(`❌ ADJUDICATION_REJECTED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

process.exit(main());
