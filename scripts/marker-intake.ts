// ============================================
// R3.10-K Phase 9 — Marker Score Intake CLI (append-only)
//
// Usage:
//   npx tsx scripts/marker-intake.ts --fixture-dir <dir> --fixture <id>
//     --marker-id <anon-id> --marked-at <ISO> --rubric-version <v>
//     [--content <n>] [--language <n>] [--organization <n>] [--overall <n>]
//
// Appends one markerScores[] entry. Never mutates the script or other
// markers. Duplicate markerId is rejected (append-only).
// ============================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  appendMarkerScore,
  type HumanMarkerCalibrationFixture,
  type HumanMarkerScoreEntry,
} from "../src/modules/ai/calibration";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

function num(name: string): number | null {
  const v = arg(name);
  return v === undefined || v === "" ? null : Number(v);
}

function main(): number {
  const dir = arg("fixture-dir");
  const fixtureId = arg("fixture");
  const markerId = arg("marker-id");
  const markedAt = arg("marked-at");
  if (!dir || !fixtureId || !markerId || !markedAt) {
    console.error("Usage: marker-intake.ts --fixture-dir <dir> --fixture <id> --marker-id <id> --marked-at <ISO> [scores...]");
    return 1;
  }
  const file = join(dir, `${fixtureId}.json`);
  if (!existsSync(file)) {
    console.error(`❌ fixture not found: ${file}`);
    return 1;
  }
  const fixture = JSON.parse(readFileSync(file, "utf-8")) as HumanMarkerCalibrationFixture;
  const entry: HumanMarkerScoreEntry = {
    markerId,
    contentScore: num("content"),
    languageScore: num("language"),
    organizationScore: num("organization"),
    overallScore: num("overall"),
    markedAt,
  };
  try {
    const updated = appendMarkerScore(fixture, entry);
    writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
    console.log(`✅ Marker ${markerId} score appended to ${fixtureId} (other markers untouched).`);
    return 0;
  } catch (err) {
    console.error(`❌ MARKING_REJECTED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

process.exit(main());
