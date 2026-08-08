// ============================================
// Sprint 129: Golden Benchmark Runner
// Loads fixtures from writing-golden/, runs analyzeWriting,
// and compares against expected scores when available.
//
// IMPORTANT: Expected scores may be null (awaiting human-marker
// calibration). The runner only compares when scores are present.
// ============================================

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { analyzeWriting } from "@/modules/ai/usecases/analyze-writing";
import type { WritingAnalysis } from "@/modules/ai/usecases/analyze-writing";

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
    overallScore: number;
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

export function loadFixtures(): GoldenFixture[] {
  try {
    const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith(".json"));
    return files.map(file => {
      const raw = readFileSync(join(FIXTURES_DIR, file), "utf-8");
      return JSON.parse(raw) as GoldenFixture;
    });
  } catch {
    return [];
  }
}

// ============================================
// Runner
// ============================================

export async function runGoldenBenchmark(
  options: { timeoutMs?: number } = {},
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
    } catch (err) {
      results.push({
        fixtureId: fixture.id,
        actual: { overallScore: 0 },
        errors: { content: null, language: null, organization: null, overall: null },
        hasHumanScores: false,
      });
    }
  }

  const scored = results.filter(r => r.hasHumanScores);

  const mean = (values: number[]) => {
    if (values.length === 0) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  };

  const rmse = (values: number[]) => {
    if (values.length === 0) return null;
    return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
  };

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
