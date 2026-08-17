// ============================================
// R3.10-K Phase 9 — Blinded Marker Pack CLI
//
// Usage:
//   npx tsx scripts/marker-pack.ts --fixture-dir <dir> --fixture <id>
//     --out <pack-file.json> [--marker-index <n>] [--rubric-text-file <path>]
//
// The pack is deterministic and contains NO AI scores/feedback/predictions,
// model info, calibration results, other marker scores, or adjudication.
// ============================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarkerPack,
  serializeMarkerPack,
  type HumanMarkerCalibrationFixture,
} from "../src/modules/ai/calibration";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

function main(): number {
  const dir = arg("fixture-dir");
  const fixtureId = arg("fixture");
  const out = arg("out");
  if (!dir || !fixtureId || !out) {
    console.error("Usage: marker-pack.ts --fixture-dir <dir> --fixture <id> --out <file> [--marker-index <n>] [--rubric-text-file <path>]");
    return 1;
  }
  const file = join(dir, `${fixtureId}.json`);
  if (!existsSync(file)) {
    console.error(`❌ fixture not found: ${file}`);
    return 1;
  }
  const fixture = JSON.parse(readFileSync(file, "utf-8")) as HumanMarkerCalibrationFixture;
  const rubricFile = arg("rubric-text-file");
  const pack = buildMarkerPack(fixture, {
    markerIndex: Number(arg("marker-index") ?? 1),
    rubricText: rubricFile && existsSync(rubricFile) ? readFileSync(rubricFile, "utf-8") : undefined,
  });
  writeFileSync(out, serializeMarkerPack(pack), "utf-8");
  console.log(`✅ Marker pack written to ${out} (blinded — no AI fields, no other-marker data).`);
  return 0;
}

process.exit(main());
