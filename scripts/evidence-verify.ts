// ============================================
// R3.10-K Phase 9 — Evidence Verification CLI
//
// The ONLY path from unverified → verified. Requires:
//   - an explicit human actor (--verified-by)
//   - a timestamp (--verified-at, defaults to now — explicit flag available)
//   - source-hash confirmation (must equal the fixture sourceHash)
//   - script identity + score/source confirmation flags
//
// Usage:
//   npx tsx scripts/evidence-verify.ts --fixture-dir <dir> --fixture <id>
//     --verified-by <human-id> [--verified-at <ISO>]
//     --confirm-source-hash <sha256> --confirm-script --confirm-scores
//
// Never auto-verifies; verified → verified is a no-op error.
// ============================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { HumanMarkerCalibrationFixture } from "../src/modules/ai/calibration";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function main(): number {
  const dir = arg("fixture-dir");
  const fixtureId = arg("fixture");
  const verifiedBy = arg("verified-by");
  const verifiedAt = arg("verified-at") ?? new Date().toISOString();
  const confirmedHash = arg("confirm-source-hash");
  const scriptConfirmed = flag("confirm-script");
  const scoresConfirmed = flag("confirm-scores");

  if (!dir || !fixtureId || !verifiedBy) {
    console.error(
      "Usage: evidence-verify.ts --fixture-dir <dir> --fixture <id> --verified-by <human-id> "
      + "[--verified-at <ISO>] --confirm-source-hash <sha256> --confirm-script --confirm-scores",
    );
    return 1;
  }
  if (!confirmedHash || !scriptConfirmed || !scoresConfirmed) {
    console.error(
      "❌ VERIFICATION REJECTED: --confirm-source-hash, --confirm-script and --confirm-scores are ALL required.",
    );
    return 1;
  }

  const file = join(dir, `${fixtureId}.json`);
  if (!existsSync(file)) {
    console.error(`❌ fixture not found: ${file}`);
    return 1;
  }
  const fixture = JSON.parse(readFileSync(file, "utf-8")) as HumanMarkerCalibrationFixture;

  if (fixture.verification?.status === "verified") {
    console.error("❌ already verified — verification is immutable once performed.");
    return 1;
  }
  if (confirmedHash !== fixture.provenance.sourceHash) {
    console.error(
      "❌ VERIFICATION REJECTED: confirmed source hash does not match the fixture sourceHash — verification cannot bypass the source hash.",
    );
    return 1;
  }

  const updated: HumanMarkerCalibrationFixture = {
    ...fixture,
    verification: {
      status: "verified",
      verifiedBy,
      verifiedAt,
      confirmedSourceHash: confirmedHash,
      scriptIdentityConfirmed: true,
      scoreSourceConfirmed: true,
    },
  };
  writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
  console.log(`✅ VERIFIED ${fixtureId} by ${verifiedBy} at ${verifiedAt}.`);
  return 0;
}

process.exit(main());
