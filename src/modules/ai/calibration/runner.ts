// ============================================
// R3.10-F: Calibration Benchmark Runner
//
// Runs the writing analysis pipeline over AUTHORITATIVE HKEAA
// calibration fixtures and compares against officially published
// values (levels; numeric scores where officially published).
//
// Separation invariants:
//   - ONLY authoritative fixtures are loaded here (synthetic
//     regression fixtures live elsewhere and never enter these
//     metrics).
//   - Fixtures without runnable script text are counted as
//     unscorable — they never produce agreement numbers.
//   - Analyzer failures are recorded per comparison, never
//     silently dropped.
//   - Invalid fixtures abort the run (fail closed).
// ============================================

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { WritingAnalysis } from "@/modules/ai/usecases/analyze-writing";
import { SCORING_VERSION } from "@/modules/ai/core/writing-score-policy";
import { getPrompt } from "@/modules/ai/prompts/prompt-registry";
import type {
  AuthoritativeCalibrationFixture,
  CalibrationBenchmarkReport,
  CalibrationComparison,
  CalibrationGatePolicy,
  CalibrationRunMetadata,
  HumanMarkerCalibrationFixture,
  InsufficientDataArea,
} from "./types";
import { DEFAULT_CALIBRATION_GATE_POLICY } from "./types";
import {
  CALIBRATION_DATASET_VERSION,
  CALIBRATION_VERSION,
  computeDatasetFingerprint,
  type DatasetFingerprintEntry,
} from "./version";
import {
  classifyFixtureKind,
  validateAuthoritativeFixture,
} from "./provenance";
import {
  classifyHumanMarkerEvidence,
  humanMarkerEvidenceKey,
  validateHumanMarkerEvidenceSet,
} from "./human-marker";
import { computeCalibrationMetrics } from "./metrics";
import { evaluateCalibrationGates } from "./gates";

/** Injectable analyzer signature (default: canonical analyzeWriting). */
export type CalibrationAnalyzer = (input: {
  title: string;
  prompt: string;
  studentDraft: string;
  textType?: string;
}) => Promise<WritingAnalysis>;

/**
 * Default analyzer: lazily imports the canonical writing analysis
 * pipeline so that loading the calibration module itself has NO
 * database / AI-pipeline dependency (evaluation-only guarantee).
 */
const defaultAnalyzer: CalibrationAnalyzer = input =>
  import("@/modules/ai/usecases/analyze-writing").then(m =>
    m.analyzeWriting(input),
  );

export interface CalibrationRunnerOptions {
  /** Authoritative fixtures directory. */
  fixturesDir?: string;
  /** Fixture list override (tests). */
  fixtures?: AuthoritativeCalibrationFixture[];
  /** Analyzer override (tests); defaults to the canonical pipeline. */
  analyzer?: CalibrationAnalyzer;
  /** Gate policy override; defaults to DEFAULT_CALIBRATION_GATE_POLICY. */
  policy?: CalibrationGatePolicy;
  /** Report generation timestamp (injected for determinism in tests). */
  now?: () => string;
  /**
   * Phase 7: attribution metadata override. Callers (CLI) may supply
   * values they know (e.g. commit sha); everything else comes from
   * canonical sources. Values that cannot be known are reported as
   * "unavailable" — never fabricated.
   */
  runMetadata?: Partial<CalibrationRunMetadata>;
}

/**
 * Phase 7: Build execution attribution from canonical sources.
 * scoringVersion ← writing-score-policy (canonical).
 * promptVersion ← prompt-registry AnalyzeWriting entry (canonical).
 * Provider/model/temperature are runtime-selected by the provider
 * chain and NOT knowable here — reported as "unavailable" (honest),
 * unless a caller supplies them. Deterministic test analyzers must
 * declare themselves explicitly.
 */
export function buildRunMetadata(
  datasetEntries: DatasetFingerprintEntry[],
  override: Partial<CalibrationRunMetadata> = {},
): CalibrationRunMetadata {
  const registryPrompt = getPrompt("AnalyzeWriting");
  return {
    calibrationVersion: CALIBRATION_VERSION,
    datasetVersion: CALIBRATION_DATASET_VERSION,
    scoringVersion: SCORING_VERSION,
    promptVersion: registryPrompt?.version ?? "unavailable",
    provider: "unavailable",
    model: "unavailable",
    temperature: null,
    commitSha: null,
    datasetFingerprint: computeDatasetFingerprint(datasetEntries),
    ...override,
  };
}

export const DEFAULT_CALIBRATION_FIXTURES_DIR = join(
  __dirname,
  "fixtures",
  "hkeaa",
);

/**
 * Load authoritative fixtures from a directory. FAILS CLOSED on
 * malformed or invalid fixtures — no silent skipping.
 */
export function loadAuthoritativeFixtures(
  dir: string = DEFAULT_CALIBRATION_FIXTURES_DIR,
): AuthoritativeCalibrationFixture[] {
  if (!existsSync(dir)) {
    throw new Error(`Calibration fixtures directory not found: ${dir}`);
  }
  const files = readdirSync(dir)
    .filter(f => f.endsWith(".json") && f !== "manifest.json" && f !== "quarantine.json")
    .sort();
  const fixtures: AuthoritativeCalibrationFixture[] = [];
  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    // Rubric references share the directory but are not calibration fixtures.
    if (
      typeof parsed === "object" && parsed !== null
      && (parsed as { kind?: unknown }).kind === "official-rubric-reference"
    ) {
      continue;
    }
    if (classifyFixtureKind(parsed) !== "authoritative-calibration") {
      throw new Error(
        `${file}: not an authoritative calibration fixture (missing HKEAA provenance)`,
      );
    }
    const result = validateAuthoritativeFixture(parsed as AuthoritativeCalibrationFixture);
    if (!result.ok) {
      throw new Error(`${file}: validation failed — ${result.errors.join("; ")}`);
    }
    fixtures.push(parsed as AuthoritativeCalibrationFixture);
  }
  return fixtures;
}

/** Fixture is runnable when script text AND a published value exist. */
function isRunnable(f: AuthoritativeCalibrationFixture): boolean {
  const hasScript = f.studentScript !== null && f.studentScript.trim() !== "";
  const hasPublished = f.publishedLevel !== null || f.publishedOverallScore !== null;
  return hasScript && hasPublished;
}

export const DEFAULT_HUMAN_MARKER_FIXTURES_DIR = join(
  __dirname,
  "fixtures",
  "human-marker",
);

/**
 * Load human-marker fixtures from the evidence directory (flat or
 * per-year subdirectories). FAILS CLOSED: any non-fixture JSON
 * (other than manifest.json) or invalid fixture throws.
 */
export function loadHumanMarkerFixtures(
  dir: string = DEFAULT_HUMAN_MARKER_FIXTURES_DIR,
): HumanMarkerCalibrationFixture[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const NON_FIXTURE_FILES = new Set(["manifest.json", "inventory.json", "quarantine.json"]);
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".json") && !NON_FIXTURE_FILES.has(entry.name)) files.push(p);
    }
  };
  walk(dir);
  files.sort();

  const fixtures: HumanMarkerCalibrationFixture[] = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (classifyFixtureKind(parsed) !== "human-marker-calibration") {
      throw new Error(
        `${file}: not a human-marker calibration fixture — fail closed (no mixing of datasets)`,
      );
    }
    fixtures.push(parsed as HumanMarkerCalibrationFixture);
  }
  return fixtures;
}

function compareCriterion(
  published: number | null,
  predicted: number | null,
): { published: number | null; predicted: number | null; error: number | null } {
  const error = published !== null && predicted !== null ? predicted - published : null;
  return { published, predicted, error };
}

/**
 * Run the calibration benchmark. Pure orchestration around an
 * injected analyzer — deterministic for a fixed analyzer and
 * fixture set.
 */
export async function runCalibrationBenchmark(
  options: CalibrationRunnerOptions = {},
): Promise<CalibrationBenchmarkReport> {
  const fixtures = options.fixtures
    ?? loadAuthoritativeFixtures(options.fixturesDir);
  const analyzer: CalibrationAnalyzer = options.analyzer ?? defaultAnalyzer;
  const policy = options.policy ?? DEFAULT_CALIBRATION_GATE_POLICY;
  const now = options.now ?? (() => new Date().toISOString());

  // Fail closed before any analysis.
  for (const fixture of fixtures) {
    const result = validateAuthoritativeFixture(fixture);
    if (!result.ok) {
      throw new Error(`Fixture ${fixture.id} invalid: ${result.errors.join("; ")}`);
    }
  }

  const comparisons: CalibrationComparison[] = [];
  let unscorable = 0;
  let quarantined = 0;

  for (const fixture of fixtures) {
    if (
      fixture.calibrationStatus === "quarantined-needs-manual-verification"
      || fixture.calibrationStatus === "quarantined-duplicate-source"
    ) {
      quarantined += 1;
      continue;
    }
    if (!isRunnable(fixture)) {
      unscorable += 1;
      continue;
    }

    let analysis: WritingAnalysis | null = null;
    let failure: string | null = null;
    try {
      analysis = await analyzer({
        title: fixture.id,
        prompt: fixture.provenance.taskId,
        studentDraft: fixture.studentScript as string,
      });
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }

    const predictedLevel = analysis?.platformWritingEstimate ?? analysis?.dseLevel ?? null;
    const predictedOverall = analysis?.overallScore ?? null;

    comparisons.push({
      fixtureId: fixture.id,
      year: fixture.provenance.sourceYear,
      taskId: fixture.provenance.taskId,
      paper: fixture.provenance.paper,
      publishedLevel: fixture.publishedLevel === null ? null : String(fixture.publishedLevel),
      predictedLevel,
      levelExactMatch:
        fixture.publishedLevel !== null && predictedLevel !== null
          ? String(fixture.publishedLevel) === predictedLevel
          : null,
      publishedOverall: fixture.publishedOverallScore,
      predictedOverall,
      overallError:
        fixture.publishedOverallScore !== null && predictedOverall !== null
          ? predictedOverall - fixture.publishedOverallScore
          : null,
      criterion: {
        content: compareCriterion(fixture.publishedContentScore, analysis?.contentScore ?? null),
        language: compareCriterion(fixture.publishedLanguageScore, analysis?.languageScore ?? null),
        organization: compareCriterion(fixture.publishedOrganizationScore, analysis?.organizationScore ?? null),
      },
      verificationStatus: null, // HKEAA authoritative fixtures carry no verification state
      analysisFailure: failure,
    });
  }

  const scored = comparisons.filter(c => c.analysisFailure === null);
  const metrics = computeCalibrationMetrics(scored);

  const insufficientAreas: InsufficientDataArea[] = [];
  const unscorableCount = unscorable;
  if (unscorableCount > 0) {
    insufficientAreas.push({
      area: "authoritative-script-text",
      detail:
        `${unscorableCount} authoritative fixture(s) carry an officially published `
        + "level but no extractable candidate script text (handwritten scans). "
        + "They cannot contribute to score-agreement metrics.",
    });
  }
  if (scored.length === 0) {
    insufficientAreas.push({
      area: "scored-samples",
      detail:
        "No authoritative fixture has both script text and a published value, "
        + "so no agreement statistics could be computed. "
        + "INSUFFICIENT AUTHORITATIVE DATA.",
    });
  }
  if (fixtures.length === 0) {
    insufficientAreas.push({
      area: "authoritative-samples",
      detail: "No authoritative calibration fixtures were found.",
    });
  }

  const gate = evaluateCalibrationGates({
    sampleCount: fixtures.length,
    // P1 (Phase 8 Step 4): sufficiency derives from ACTUAL comparable
    // overall pairs, not analyzed fixtures. Authoritative HKEAA fixtures
    // never produce overall pairs (levels only).
    scoredCount: comparisons.filter(c => c.overallError !== null).length,
    verifiedComparableCount: 0, // authoritative fixtures carry no human verification state
    policy,
    report: { metrics },
  });

  return {
    sampleCount: fixtures.length,
    scoredCount: scored.length,
    unscorableCount,
    quarantinedCount: quarantined,
    metrics,
    comparisons,
    insufficientAreas,
    gate,
    generatedAt: now(),
    runMetadata: buildRunMetadata(
      fixtures.map(authoritativeFingerprintEntry),
      options.runMetadata,
    ),
  };
}

/** Phase 8: full ground-truth identity for an authoritative fixture. */
function authoritativeFingerprintEntry(f: AuthoritativeCalibrationFixture): DatasetFingerprintEntry {
  return {
    id: f.id,
    sourceHash: f.provenance.sourceHash,
    contentScore: f.publishedContentScore,
    languageScore: f.publishedLanguageScore,
    organizationScore: f.publishedOrganizationScore,
    overallScore: f.publishedOverallScore,
    publishedLevel: f.publishedLevel === null ? null : String(f.publishedLevel),
    rubricVersion: f.rubricVersion,
    verificationStatus: null,
  };
}

/** Phase 8: full ground-truth identity for a human-marker fixture. */
function humanMarkerFingerprintEntry(f: HumanMarkerCalibrationFixture): DatasetFingerprintEntry {
  return {
    id: f.id,
    sourceHash: f.provenance.sourceHash,
    contentScore: f.contentScore,
    languageScore: f.languageScore,
    organizationScore: f.organizationScore,
    overallScore: f.overallScore,
    publishedLevel: f.publishedLevel,
    rubricVersion: f.rubricVersion,
    verificationStatus: f.provenance.sourceAuthorityAssertion?.verificationStatus ?? null,
    taskPartScope: f.taskPartScope ?? null,
    comparabilityNotes: f.comparabilityNotes ?? null,
    subScores: f.publishedSubScores,
    markerScores: f.markerScores,
    adjudication: f.adjudication,
  };
}

// ============================================
// R3.10-F: Human-Marker Calibration Benchmark
//
// Runs the SAME metrics / gates / report machinery over future
// genuine human-marker-scored scripts. Strictly separated from the
// HKEAA authoritative path: each entry point accepts only its own
// fixture category, so the three datasets (HKEAA level-only,
// human-marker scored, synthetic regression) are never mixed.
//
// Score mapping rules (fail-closed, declared scales only):
//   - overallScore  "clo-total-0-21"   → analysis.cloTotalScore
//                  "percentage-0-100"  → analysis.overallScore
//   - criterion     "clo-0-7"          → analysis C/L/O (0-7)
//   Any other/undeclared scale fails validation before analysis.
// ============================================

export interface HumanMarkerRunnerOptions {
  /** Human-marker fixtures (clearly-labelled test fixtures in tests). */
  fixtures: HumanMarkerCalibrationFixture[];
  /** Analyzer override (tests); defaults to the canonical pipeline. */
  analyzer?: CalibrationAnalyzer;
  /** Gate policy override; defaults to DEFAULT_CALIBRATION_GATE_POLICY. */
  policy?: CalibrationGatePolicy;
  /** Report timestamp injection for byte-reproducible reports. */
  now?: () => string;
  /** Phase 7: attribution metadata override (e.g. commit sha from CLI). */
  runMetadata?: Partial<CalibrationRunMetadata>;
}

function mapHumanMarkerComparison(
  fixture: HumanMarkerCalibrationFixture,
  analysis: WritingAnalysis | null,
  failure: string | null,
): { comparison: CalibrationComparison; scopeExcluded: boolean } {
  const predictedLevel = analysis?.platformWritingEstimate ?? analysis?.dseLevel ?? null;

  // Overall: mapped ONLY through the fixture's declared scale.
  const basis = fixture.scoreProvenance.overallScoreBasis;

  // P2 (Phase 8): clo-total-0-21 human scores MUST declare a compatible
  // single-part task scope. Ambiguous / full-paper scope is NEVER compared.
  const scope = fixture.taskPartScope?.trim() ?? "";
  const scopeExcluded =
    basis === "clo-total-0-21"
    && fixture.overallScore !== null
    && (scope === "" || /^full[-_]?paper$/i.test(scope));

  const predictedOverall = analysis === null || fixture.overallScore === null || scopeExcluded
    ? null
    : basis === "percentage-0-100"
      ? analysis.overallScore
      : basis === "clo-total-0-21"
        ? analysis.cloTotalScore ?? null
        : null;

  return {
    comparison: {
      fixtureId: fixture.id,
      year: fixture.provenance.sourceYear,
      taskId: fixture.provenance.taskId,
      paper: fixture.provenance.paper,
      publishedLevel: fixture.publishedLevel,
      predictedLevel,
      levelExactMatch:
        fixture.publishedLevel !== null && predictedLevel !== null
          ? String(fixture.publishedLevel) === predictedLevel
          : null,
      publishedOverall: scopeExcluded ? null : fixture.overallScore,
      predictedOverall,
      overallError:
        !scopeExcluded && fixture.overallScore !== null && predictedOverall !== null
          ? predictedOverall - fixture.overallScore
          : null,
      criterion: {
        content: compareCriterion(fixture.contentScore, analysis?.contentScore ?? null),
        language: compareCriterion(fixture.languageScore, analysis?.languageScore ?? null),
        organization: compareCriterion(fixture.organizationScore, analysis?.organizationScore ?? null),
      },
      markerPolicy: fixture.markerPolicy,
      verificationStatus: fixture.provenance.sourceAuthorityAssertion?.verificationStatus ?? null,
      analysisFailure: failure,
    },
    scopeExcluded,
  };
}

/**
 * Run the calibration benchmark over human-marker evidence.
 * FAILS CLOSED on:
 *   - any fixture failing validateHumanMarkerFixture
 *   - conflicting evidence (same marked script, different
 *     scores/policy/hash) via validateHumanMarkerEvidenceSet
 * Identical duplicates are deduplicated deterministically (first
 * fixture wins) and reported in the insufficientAreas list.
 */
export async function runHumanMarkerCalibrationBenchmark(
  options: HumanMarkerRunnerOptions,
): Promise<CalibrationBenchmarkReport> {
  const { fixtures } = options;
  const analyzer: CalibrationAnalyzer = options.analyzer ?? defaultAnalyzer;
  const policy = options.policy ?? DEFAULT_CALIBRATION_GATE_POLICY;
  const now = options.now ?? (() => new Date().toISOString());

  // Fail closed BEFORE any analysis: individual validation + set check.
  const setResult = validateHumanMarkerEvidenceSet(fixtures);
  if (!setResult.ok) {
    throw new Error(
      `Human-marker evidence set is invalid (fail closed): ${setResult.errors.join("; ")}`,
    );
  }

  // Deterministic dedupe of identical evidence (idempotent re-ingestion).
  const seenKeys = new Set<string>();
  const deduped: HumanMarkerCalibrationFixture[] = [];
  for (const fixture of fixtures) {
    const key = humanMarkerEvidenceKey(fixture);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(fixture);
  }
  const duplicateCount = fixtures.length - deduped.length;

  const comparisons: CalibrationComparison[] = [];
  const scopeExclusions: string[] = [];
  let quarantined = 0;

  for (const fixture of deduped) {
    if (fixture.calibrationStatus === "quarantined-needs-manual-verification") {
      quarantined += 1;
      continue;
    }

    let analysis: WritingAnalysis | null = null;
    let failure: string | null = null;
    try {
      analysis = await analyzer({
        title: fixture.id,
        prompt: fixture.provenance.taskId,
        studentDraft: fixture.studentScript,
      });
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }
    const mapped = mapHumanMarkerComparison(fixture, analysis, failure);
    if (mapped.scopeExcluded) {
      scopeExclusions.push(
        `${fixture.id}: clo-total-0-21 overall score has no compatible single-part `
        + `task scope declared (got "${fixture.taskPartScope ?? "<none>"}") — excluded from comparison`,
      );
    }
    comparisons.push(mapped.comparison);
  }

  const scored = comparisons.filter(c => c.analysisFailure === null);
  const metrics = computeCalibrationMetrics(scored);

  const insufficientAreas: InsufficientDataArea[] = [];
  if (duplicateCount > 0) {
    insufficientAreas.push({
      area: "duplicate-evidence-deduped",
      detail:
        `${duplicateCount} identical duplicate evidence record(s) were deduplicated `
        + "(deterministic first-wins; idempotent re-ingestion).",
    });
  }
  if (scored.length === 0) {
    insufficientAreas.push({
      area: "scored-samples",
      detail:
        "No human-marker fixture produced a comparison, so no agreement "
        + "statistics could be computed. INSUFFICIENT AUTHORITATIVE DATA.",
    });
  }
  if (deduped.length === 0) {
    insufficientAreas.push({
      area: "human-marker-samples",
      detail: "No human-marker calibration fixtures were provided.",
    });
  }
  for (const detail of scopeExclusions) {
    insufficientAreas.push({
      area: "scope-ambiguous-excluded",
      detail,
    });
  }

  // P1-F2 (Phase 8 Step 4): sufficiency is derived from the SAME
  // authoritative collection — ACTUAL overall comparable pairs.
  // A verified fixture whose overall pair was scope-excluded (or never
  // formed) does NOT count. VERIFIED FIXTURES ≠ VERIFIED COMPARABLE PAIRS.
  const overallComparablePairs = comparisons.filter(c => c.overallError !== null);
  const verifiedComparablePairs = overallComparablePairs.filter(
    c => c.verificationStatus === "verified",
  );

  const gate = evaluateCalibrationGates({
    sampleCount: deduped.length,
    scoredCount: overallComparablePairs.length,
    verifiedComparableCount: verifiedComparablePairs.length,
    policy,
    report: { metrics },
  });

  // Evidence-category breakdown — NEVER collapsed into one count.
  const evidenceBreakdown = {
    overallComparable: 0,
    criterionOnly: 0,
    nonComparable: 0,
    levelOnly: 0,
    quarantined: 0,
  };
  for (const fixture of deduped) {
    switch (classifyHumanMarkerEvidence(fixture)) {
      case "ACCEPT_OVERALL_SCORE": evidenceBreakdown.overallComparable += 1; break;
      case "ACCEPT_CRITERION_ONLY": evidenceBreakdown.criterionOnly += 1; break;
      case "NON_COMPARABLE_SCORE": evidenceBreakdown.nonComparable += 1; break;
      case "LEVEL_ONLY": evidenceBreakdown.levelOnly += 1; break;
      case "IMAGE_ONLY_UNREADABLE": evidenceBreakdown.quarantined += 1; break;
      case "TEACHING_REFERENCE": break; // never part of the fixture set
      case "CONFLICT": evidenceBreakdown.quarantined += 1; break;
    }
  }

  // Phase 7: verification state — NEVER conflated with evidence counts.
  const evidenceVerification = {
    verified: 0,
    unverified: 0,
    total: deduped.length,
  };
  for (const fixture of deduped) {
    const status = fixture.provenance.sourceAuthorityAssertion?.verificationStatus;
    if (status === "verified") evidenceVerification.verified += 1;
    else evidenceVerification.unverified += 1;
  }

  return {
    sampleCount: deduped.length,
    scoredCount: scored.length,
    unscorableCount: 0,
    quarantinedCount: quarantined,
    metrics,
    comparisons,
    insufficientAreas,
    gate,
    evidenceBreakdown,
    generatedAt: now(),
    runMetadata: buildRunMetadata(
      deduped.map(humanMarkerFingerprintEntry),
      options.runMetadata,
    ),
    evidenceVerification,
  };
}
