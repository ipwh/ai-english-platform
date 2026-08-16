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
  buildRunMetadata,
} from "../src/modules/ai/calibration";
import type { CalibrationRunMetadata } from "../src/modules/ai/calibration";
import type { BenchmarkReport } from "../src/modules/ai/evaluation/golden-runner";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const withRegression = args.includes("--with-regression");
const deterministicAnalyzer = args.includes("--analyzer=deterministic");
const nowArg = args.find(a => a.startsWith("--now="))?.split("=").slice(1).join("=");

/** Git commit of the current checkout; null when unavailable — never fabricated. */
function currentCommitSha(): string | null {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Deterministic test analyzer for byte-reproducible runs. Explicitly
 * declares itself as a deterministic-test-analyzer — it NEVER pretends
 * to be production LLM output.
 */
function deterministicTestAnalyzer(input: { title: string }) {
  const h = (s: string) => {
    let v = 0;
    for (let i = 0; i < s.length; i++) v = (v * 31 + s.charCodeAt(i)) >>> 0;
    return v;
  };
  const seed = h(input.title) % 21;
  return Promise.resolve({
    overallScore: 70,
    contentScore: 5,
    languageScore: 5,
    organizationScore: 5,
    cloTotalScore: 15,
    dseLevel: "4",
    platformWritingEstimate: "4",
    strengths: [],
    weaknesses: [],
    grammarErrors: [],
    chinglishWarnings: [],
    vocabularySuggestions: [],
    structureFeedback: "deterministic-test-analyzer",
    generalComment: `deterministic-test-analyzer (seed ${seed})`,
  });
}

async function main(): Promise<number> {
  console.log("🔬 HKDSE Calibration Report");
  console.log("");
  if (deterministicAnalyzer) {
    console.log("⚠️ Deterministic test analyzer selected — results are NOT production LLM output.");
    console.log("");
  }

  let regression: BenchmarkReport | undefined;
  if (withRegression) {
    const { runGoldenBenchmark } = await import(
      "../src/modules/ai/evaluation/golden-runner"
    );
    regression = await runGoldenBenchmark();
  }

  const nowOption = nowArg ? { now: () => nowArg } : {};
  const runMetadata: Partial<CalibrationRunMetadata> = {
    commitSha: currentCommitSha(),
    ...(deterministicAnalyzer
      ? { provider: "deterministic-test-analyzer", model: "deterministic-test-analyzer", temperature: 0 }
      : {}),
  };
  const analyzerOption = deterministicAnalyzer
    ? { analyzer: deterministicTestAnalyzer }
    : {};

  // 1. Authoritative HKEAA level-only report.
  let authoritative;
  try {
    // A fixed --now timestamp makes the report byte-reproducible.
    authoritative = await runCalibrationBenchmark({ ...nowOption, ...analyzerOption, runMetadata });
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
        ...analyzerOption,
        runMetadata,
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
      console.log("❌ CALIBRATION GATE: FAIL — release gate blocked");
      return 1;
    default:
      console.log("⚠️ CALIBRATION GATE: INSUFFICIENT AUTHORITATIVE DATA (exit 2)");
      console.log("   SOFTWARE CHECKS MAY PASS — ASSESSMENT VALIDITY IS NOT ESTABLISHED.");
      console.log("   This platform makes NO claim of HKDSE marker-equivalence.");
      return 2;
  }
}

void main().then(code => process.exit(code));
