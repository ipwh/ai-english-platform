// ============================================
// R3.10-K Phase 9 — External Evidence Intake CLI
//
// Usage:
//   npx tsx scripts/evidence-intake.ts --manifest <path-to-submission.json>
//     --out <fixtures-dir>
//
// The submission JSON is an ExternalEvidenceSubmission. Output fixtures
// are ALWAYS unverified. AI-authored / unknown authorship is rejected.
// ============================================

import { readFileSync } from "node:fs";
import { ingestExternalEvidence, writeIntakeOutput } from "../src/modules/ai/calibration";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

function main(): number {
  const manifestPath = arg("manifest");
  const outDir = arg("out");
  if (!manifestPath || !outDir) {
    console.error("Usage: npx tsx scripts/evidence-intake.ts --manifest <json> --out <fixtures-dir>");
    return 1;
  }
  try {
    const submissions = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const list = Array.isArray(submissions) ? submissions : [submissions];
    const fixtures = list.map(s => ingestExternalEvidence(s as never));
    const outcome = writeIntakeOutput(fixtures, outDir);
    console.log(`✅ Intake complete — written ${outcome.written.length}, unchanged ${outcome.unchanged.length} (ALL UNVERIFIED).`);
    return 0;
  } catch (err) {
    console.error(`❌ INTAKE_REJECTED (fail-closed): ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

process.exit(main());
