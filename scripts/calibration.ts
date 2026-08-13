// ============================================
// Calibration Report CLI (R3.10-F / R3.10-G)
//
// Usage:
//   npx tsx scripts/calibration.ts
//   npx tsx scripts/calibration.ts --with-regression
//   npx tsx scripts/calibration.ts --now=2026-08-13T00:00:00.000Z
//
// Prints the calibration report (authoritative HKEAA level-only
// data) and, when human-marker evidence has been ingested, a
// SEPARATE human-marker report. The datasets are always reported
// separately and never combined into one metric.
//
// Exit codes (CI gate):
//   0 — gate PASS (never a marker-equivalence claim)
//   1 — gate FAIL
//   2 — INSUFFICIENT_DATA
// ============================================

import {
  runCalibrationBenchmark,
  runHumanMarkerCalibrationBenchmark,
  loadHumanMarkerFixtures,
  renderCalibrationReport,
} from "../src/modules/ai/calibration";
import type { BenchmarkReport } from "../src/modules/ai/evaluation/golden-runner";

const args = process.argv.slice(2);
const withRegression = args.includes("--with-regression");
const nowArg = args.find(a => a.startsWith("--now="))?.split("=").slice(1).join("=");

async function main(): Promise<number> {
  console.log("🔬 HKDSE Calibration Report");
  console.log("");

  let regression: BenchmarkReport | undefined;
  if (withRegression) {
    const { runGoldenBenchmark } = await import(
      "../src/modules/ai/evaluation/golden-runner"
    );
    regression = await runGoldenBenchmark();
  }

  const nowOption = nowArg ? { now: () => nowArg } : {};

  // 1. Authoritative HKEAA level-only report.
  let authoritative;
  try {
    // A fixed --now timestamp makes the report byte-reproducible.
    authoritative = await runCalibrationBenchmark(nowOption);
  } catch (err) {
    console.error(`❌ Calibration run FAILED (fail closed): ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  console.log(renderCalibrationReport(authoritative, regression));
  console.log("");

  // 2. Human-marker evidence report (separate dataset, separate gate).
  let humanMarker;
  const hmFixtures = loadHumanMarkerFixtures();
  if (hmFixtures.length > 0) {
    try {
      humanMarker = await runHumanMarkerCalibrationBenchmark({
        fixtures: hmFixtures,
        ...nowOption,
      });
    } catch (err) {
      console.error(`❌ Human-marker run FAILED (fail closed): ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    console.log("=".repeat(60));
    console.log(renderCalibrationReport(humanMarker, undefined, {
      datasetDescription: "agreement with human-marker scored samples",
      criterionUnavailableMessage:
        "No criterion-level scores were supplied by markers for these samples. "
        + "Criterion statistics are NOT manufactured from overall scores.",
    }));
    console.log("");
  }

  // Gate priority: human-marker evidence gates the verdict when it
  // exists; otherwise the authoritative (level-only) gate applies.
  const gate = humanMarker ? humanMarker.gate : authoritative.gate;

  switch (gate.decision) {
    case "PASS":
      console.log("✅ CALIBRATION GATE: PASS (policy thresholds met — not a marker-equivalence claim)");
      return 0;
    case "FAIL":
      console.log("❌ CALIBRATION GATE: FAIL");
      return 1;
    default:
      console.log("⚠️ CALIBRATION GATE: INSUFFICIENT AUTHORITATIVE DATA");
      return 2;
  }
}

void main().then(code => process.exit(code));
