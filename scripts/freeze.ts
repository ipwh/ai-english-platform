// ============================================
// R3.10-K Phase 9 — Dataset Freeze CLI
//
// Usage:
//   npx tsx scripts/freeze.ts --fixtures-dir <human-marker fixtures>
//     --out <dir> [--now <ISO>] [--dataset-version <v>]
//
// FAIL-CLOSED on unverified comparable fixtures, malformed evidence,
// AI-authored authorship, or fingerprint mismatch with the same dataset
// version. Writes frozen-manifest.json + frozen-inventory.json only on
// a fully successful freeze. Never mutates scores.
// ============================================

import { runFreeze, writeFreezeOutput } from "../src/modules/ai/calibration";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

function main(): number {
  const fixturesDir = arg("fixtures-dir");
  const outDir = arg("out");
  if (!fixturesDir || !outDir) {
    console.error("Usage: freeze.ts --fixtures-dir <dir> --out <dir> [--now <ISO>] [--dataset-version <v>]");
    return 1;
  }
  const nowArg = arg("now");
  const datasetVersion = arg("dataset-version");
  try {
    const result = runFreeze({
      fixturesDir,
      outDir,
      ...(nowArg ? { now: () => nowArg } : {}),
      ...(datasetVersion ? { datasetVersion } : {}),
    });
    if (!result.ok) {
      console.error(`❌ FREEZE_BLOCKED (fail-closed):\n${result.reasons.map(r => `  - ${r}`).join("\n")}`);
      return 1;
    }
    writeFreezeOutput(result, outDir);
    console.log(
      `✅ FROZEN ${result.datasetVersion} at ${result.frozenAt} — `,
      `${result.fixtureCount} fixtures, fingerprint ${result.fingerprint}, `,
      `${result.verifiedComparableCount} verified comparable, ${result.unverifiedCount} unverified.`,
    );
    return 0;
  } catch (err) {
    console.error(`❌ FREEZE_BLOCKED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

process.exit(main());
