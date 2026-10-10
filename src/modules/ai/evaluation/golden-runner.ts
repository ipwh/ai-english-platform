// ============================================
// Sprint 129: Golden Benchmark Runner
// Loads fixtures from writing-golden/, runs analyzeWriting,
// and compares against expected scores when available.
//
// IMPORTANT: Expected scores may be null (awaiting human-marker
// calibration). The runner only compares when scores are present.
//
// R3.10-F: this runner evaluates SOFTWARE REGRESSION data
// (synthetic fixtures only). Authoritative HKEAA calibration
// fixtures live in @/modules/ai/calibration and are evaluated by
// runCalibrationBenchmark. runCombinedBenchmark() runs both and
// keeps the two datasets separate in the report.
// ============================================

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { analyzeWriting } from "@/modules/ai/usecases/analyze-writing";
import type { WritingAnalysis } from "@/modules/ai/usecases/analyze-writing";
import type {
  CalibrationBenchmarkReport,
  CalibrationGatePolicy,
} from "@/modules/ai/calibration";
import { mean, rmse } from "@/modules/ai/calibration/metrics";

// ============================================
// Types
// ============================================

export interface GoldenFixture {
  id: string;
  task: string;
  studentDraft: string;
  textType?: string;
  wordLimit?: number;
  expected: {
    contentScore?: number | null;
    languageScore?: number | null;
    organizationScore?: number | null;
    overallScore?: number | null;
  };
  annotations?: {
    requirementCoverage?: string;
    contentRationale?: string;
    languageRationale?: string;
    organizationRationale?: string;
  };
  metadata?: {
    difficulty?: "remedial" | "core" | "challenge";
    caseType?: string;
    source?: string;
    markerCount?: number;
  };
  notes?: string;
}

export interface SingleResult {
  fixtureId: string;
  caseType?: string;
  difficulty?: string;
  actual: {
    contentScore?: number;
    languageScore?: number;
    organizationScore?: number;
    cloTotalScore?: number;
    // null = 分析失敗（2026-08-30 audit R8：原以 0 記錄失敗，會與真實 0 分混淆並污染報告）
    overallScore: number | null;
    dseLevel?: string;
  };
  expected?: {
    contentScore: number | null;
    languageScore: number | null;
    organizationScore: number | null;
    overallScore: number | null;
  };
  errors: {
    content: number | null;
    language: number | null;
    organization: number | null;
    overall: number | null;
  };
  hasHumanScores: boolean;
}

export interface BenchmarkReport {
  count: number;
  scored: number;
  contentMAE: number | null;
  languageMAE: number | null;
  organizationMAE: number | null;
  overallMAE: number | null;
  contentRMSE: number | null;
  languageRMSE: number | null;
  organizationRMSE: number | null;
  overallRMSE: number | null;
  contentBias: number | null;
  languageBias: number | null;
  organizationBias: number | null;
  overallBias: number | null;
  results: SingleResult[];
}

// ============================================
// Fixture loader
// ============================================

const FIXTURES_DIR = join(
  __dirname,
  "..",
  "evaluation",
  "fixtures",
  "writing-golden",
);

/**
 * Load synthetic regression fixtures. Fails closed on malformed
 * JSON (no silent skip) and returns files in deterministic order.
 */
export function loadFixtures(): GoldenFixture[] {
  if (!existsSync(FIXTURES_DIR)) {
    throw new Error(`Golden fixtures directory not found: ${FIXTURES_DIR}`);
  }
  const files = readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith(".json"))
    .sort();
  return files.map(file => {
    const raw = readFileSync(join(FIXTURES_DIR, file), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" || parsed === null
      || typeof (parsed as GoldenFixture).id !== "string"
      || typeof (parsed as GoldenFixture).studentDraft !== "string"
    ) {
      throw new Error(
        `Golden fixture ${file} is malformed (missing id/studentDraft) — fail closed`,
      );
    }
    return parsed as GoldenFixture;
  });
}

// ============================================
// Runner
// ============================================

export async function runGoldenBenchmark(
  _options: { timeoutMs?: number } = {},
): Promise<BenchmarkReport> {
  const fixtures = loadFixtures();

  if (fixtures.length === 0) {
    return { count: 0, scored: 0, contentMAE: null, languageMAE: null, organizationMAE: null, overallMAE: null, contentRMSE: null, languageRMSE: null, organizationRMSE: null, overallRMSE: null, contentBias: null, languageBias: null, organizationBias: null, overallBias: null, results: [] };
  }

  const results: SingleResult[] = [];

  for (const fixture of fixtures) {
    try {
      const analysis: WritingAnalysis = await analyzeWriting({
        title: fixture.id,
        prompt: fixture.task,
        studentDraft: fixture.studentDraft,
        textType: fixture.textType,
      });

      const hasHumanScores = fixture.expected.contentScore != null
        || fixture.expected.languageScore != null
        || fixture.expected.organizationScore != null;

      results.push({
        fixtureId: fixture.id,
        caseType: fixture.metadata?.caseType,
        difficulty: fixture.metadata?.difficulty,
        actual: {
          contentScore: analysis.contentScore,
          languageScore: analysis.languageScore,
          organizationScore: analysis.organizationScore,
          cloTotalScore: analysis.cloTotalScore,
          overallScore: analysis.overallScore,
          dseLevel: analysis.dseLevel,
        },
        expected: hasHumanScores ? {
          contentScore: fixture.expected.contentScore ?? null,
          languageScore: fixture.expected.languageScore ?? null,
          organizationScore: fixture.expected.organizationScore ?? null,
          overallScore: fixture.expected.overallScore ?? null,
        } : undefined,
        errors: {
          content: fixture.expected.contentScore != null && analysis.contentScore != null
            ? analysis.contentScore - fixture.expected.contentScore
            : null,
          language: fixture.expected.languageScore != null && analysis.languageScore != null
            ? analysis.languageScore - fixture.expected.languageScore
            : null,
          organization: fixture.expected.organizationScore != null && analysis.organizationScore != null
            ? analysis.organizationScore - fixture.expected.organizationScore
            : null,
          overall: fixture.expected.overallScore != null
            ? analysis.overallScore - fixture.expected.overallScore
            : null,
        },
        hasHumanScores,
      });
    } catch {
      results.push({
        fixtureId: fixture.id,
        actual: { overallScore: null },
        errors: { content: null, language: null, organization: null, overall: null },
        hasHumanScores: false,
      });
    }
  }

  const scored = results.filter(r => r.hasHumanScores);

  // Single metric definition shared with the calibration module.
  return {
    count: fixtures.length,
    scored: scored.length,
    contentMAE: mean(scored.map(r => r.errors.content).filter((v): v is number => v !== null).map(Math.abs)),
    languageMAE: mean(scored.map(r => r.errors.language).filter((v): v is number => v !== null).map(Math.abs)),
    organizationMAE: mean(scored.map(r => r.errors.organization).filter((v): v is number => v !== null).map(Math.abs)),
    overallMAE: mean(scored.map(r => r.errors.overall).filter((v): v is number => v !== null).map(Math.abs)),
    contentRMSE: rmse(scored.map(r => r.errors.content).filter((v): v is number => v !== null)),
    languageRMSE: rmse(scored.map(r => r.errors.language).filter((v): v is number => v !== null)),
    organizationRMSE: rmse(scored.map(r => r.errors.organization).filter((v): v is number => v !== null)),
    overallRMSE: rmse(scored.map(r => r.errors.overall).filter((v): v is number => v !== null)),
    contentBias: mean(scored.map(r => r.errors.content).filter((v): v is number => v !== null)),
    languageBias: mean(scored.map(r => r.errors.language).filter((v): v is number => v !== null)),
    organizationBias: mean(scored.map(r => r.errors.organization).filter((v): v is number => v !== null)),
    overallBias: mean(scored.map(r => r.errors.overall).filter((v): v is number => v !== null)),
    results,
  };
}

// ============================================
// R3.10-F: Combined runner — regression + calibration
//
// Runs BOTH datasets but keeps them strictly separated:
//   .regression   — synthetic fixtures (software behavior)
//   .calibration  — authoritative HKEAA fixtures (agreement)
// No metric ever mixes the two.
// ============================================

export interface CombinedBenchmarkReport {
  regression: BenchmarkReport;
  calibration: CalibrationBenchmarkReport;
}

export interface CombinedBenchmarkOptions {
  regression?: { timeoutMs?: number };
  calibration?: {
    fixturesDir?: string;
    policy?: CalibrationGatePolicy;
  };
}

export async function runCombinedBenchmark(
  options: CombinedBenchmarkOptions = {},
): Promise<CombinedBenchmarkReport> {
  // Dynamic import keeps the calibration module lazily wired and
  // avoids any module-evaluation cycle with the evaluation layer.
  const { runCalibrationBenchmark } = await import("@/modules/ai/calibration");
  const regression = await runGoldenBenchmark(options.regression);
  const calibration = await runCalibrationBenchmark(options.calibration);
  return { regression, calibration };
}
