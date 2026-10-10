// ============================================
// R3.10-F: Release Audit Tests (Phase 10)
//
// Repository-wide authority + operational guarantees:
//   - calibration module is DB-free and offline-only
//   - report generation is deterministic
//   - ingestion fails closed on missing sources
//   - fixture loading is fail-closed and deterministic
//   - authoritative fixtures cannot silently become synthetic
//   - criterion scores remain null unless officially supplied
// ============================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ingestHKEAAMaterials } from "../ingestion/ingest-hkeaa";
import { loadAuthoritativeFixtures, runCalibrationBenchmark } from "../runner";
import { classifyFixtureKind, validateAuthoritativeFixture } from "../provenance";
import { renderCalibrationReport } from "../report";
import type { AuthoritativeCalibrationFixture } from "../types";

const MODULE_DIR = resolve(__dirname, "..");
const FIXTURES_DIR = join(MODULE_DIR, "fixtures", "hkeaa");
const PROJECT_ROOT = resolve(MODULE_DIR, "..", "..", "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function calibrationSourceFiles(): string[] {
  return walk(MODULE_DIR).filter(
    f => f.endsWith(".ts") && !f.includes("__tests__"),
  );
}

describe("Release audit — DB-free / offline-only", () => {
  it("no calibration source file imports the database or Prisma", () => {
    for (const file of calibrationSourceFiles()) {
      const content = readFileSync(file, "utf-8");
      expect(content, `${file} must not import the database`).not.toMatch(
        /from\s+["']@\/shared\/db/,
      );
      expect(content, `${file} must not import Prisma`).not.toMatch(/@prisma|prisma-client/);
    }
  });

  it("no calibration source file performs network I/O", () => {
    for (const file of calibrationSourceFiles()) {
      const content = readFileSync(file, "utf-8");
      expect(content, `${file} must be offline-only`).not.toMatch(
        /\bfetch\s*\(|https?\.request|axios|import\s+.*["']https?:/,
      );
    }
  });

  it("ingestion never mutates production DB state (no db imports in ingestion)", () => {
    const ingestionDir = join(MODULE_DIR, "ingestion");
    for (const file of readdirSync(ingestionDir).filter(f => f.endsWith(".ts"))) {
      const content = readFileSync(join(ingestionDir, file), "utf-8");
      expect(content).not.toContain("db.");
      expect(content).not.toContain("@/shared/db");
    }
  });
});

describe("Release audit — deterministic report generation", () => {
  it("produces byte-identical reports for identical inputs (fixed analyzer + now)", async () => {
    const fixtures = [{
      kind: "authoritative-calibration" as const,
      id: "hkeaa-det-test-1",
      schemaVersion: 1 as const,
      provenance: {
        sourceOrganization: "hkeaa" as const,
        sourceDocument: "Test.pdf",
        sourceYear: 2024,
        paper: "Paper 2" as const,
        taskId: "P2-2024-PartB-Q1",
        sectionId: "Level 4 exemplar 1",
        sourceFile: "test.txt",
        sourceHash: "a".repeat(64),
        extractionStatus: "complete-script-text" as const,
      },
      studentScript: "Uniforms promote equality.",
      publishedLevel: 4 as const,
      publishedOverallScore: null,
      publishedContentScore: null,
      publishedLanguageScore: null,
      publishedOrganizationScore: null,
      criterionScoresOfficiallyPublished: false,
      rubricVersion: "HKEAA-official-exemplar-levels",
      calibrationStatus: "ingested" as const,
      notes: "test",
    }];
    const analyzer = async () => ({
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
      structureFeedback: "x",
      generalComment: "x",
    });
    const opts = {
      fixtures,
      analyzer,
      now: () => "2026-08-13T00:00:00.000Z",
    } as const;
    const a = await runCalibrationBenchmark({ ...opts });
    const b = await runCalibrationBenchmark({ ...opts });
    expect(renderCalibrationReport(a)).toBe(renderCalibrationReport(b));
    expect(a.generatedAt).toBe("2026-08-13T00:00:00.000Z");
  });
});

describe("Release audit — fail-closed operations", () => {
  it("missing source files throw (ingestion never silently skips)", () => {
    const missing = join(PROJECT_ROOT, "does-not-exist-calibration-src");
    expect(() => ingestHKEAAMaterials({
      materialsDir: missing,
      descriptorsDir: join(PROJECT_ROOT, "materials", "_hkeaa_descriptors"),
    })).toThrow(/source file missing/i);
  });

  it("malformed fixture JSON in the fixtures directory throws on load", () => {
    const dir = join(tmpdir(), `cal-audit-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(join(dir, "broken.json"), "{ not valid json", "utf-8");
      expect(() => loadAuthoritativeFixtures(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fixture loading is deterministic (sorted by id)", () => {
    const fixtures = loadAuthoritativeFixtures(FIXTURES_DIR);
    const ids = fixtures.map(f => f.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("an authoritative fixture can never silently become synthetic", () => {
    const fixtures = loadAuthoritativeFixtures(FIXTURES_DIR);
    for (const fixture of fixtures.slice(0, 20)) {
      // Round-trip through serialization: authority must survive.
      const roundTripped = JSON.parse(JSON.stringify(fixture)) as unknown;
      expect(classifyFixtureKind(roundTripped)).toBe("authoritative-calibration");
      // Stripping provenance is the ONLY way to lose authority —
      // and then it fails validation, it does not become synthetic-quietly.
      const stripped = JSON.parse(JSON.stringify(fixture)) as {
        provenance?: unknown;
      };
      delete stripped.provenance;
      const result = validateAuthoritativeFixture(
        stripped as unknown as AuthoritativeCalibrationFixture,
      );
      expect(result.ok).toBe(false);
      expect(result.errors.join(" ")).toContain("provenance is required");
    }
  });

  it("criterion scores remain null unless officially published (real dataset)", () => {
    const fixtures = loadAuthoritativeFixtures(FIXTURES_DIR);
    for (const fixture of fixtures) {
      expect(fixture.publishedContentScore).toBeNull();
      expect(fixture.publishedLanguageScore).toBeNull();
      expect(fixture.publishedOrganizationScore).toBeNull();
      expect(fixture.criterionScoresOfficiallyPublished).toBe(false);
    }
  });

  it("every loaded fixture preserves its source hash", () => {
    const fixtures = loadAuthoritativeFixtures(FIXTURES_DIR);
    for (const fixture of fixtures) {
      expect(fixture.provenance.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("Release audit — repository-wide forbidden runtime imports", () => {
  /**
   * Matches IMPORT SPECIFIERS only. A prose mention of the path (a comment, a doc
   * string, a test fixture name) is not a runtime import and must not fail the
   * audit. The previous raw `content.includes('modules/ai/calibration')` check
   * produced exactly that false positive on 2026-10-10 (Sprint 134): a helper's
   * comment naming the corpus-availability pattern was flagged while importing
   * nothing from the module.
   */
  const FORBIDDEN_IMPORT =
    /(?:from\s*|import\s*\(\s*|require\(\s*|import\s+)['"][^'"]*modules\/ai\/calibration/;

  it("the detector matches real imports and ignores prose", () => {
    // Positive controls — every supported import form must be caught.
    expect(FORBIDDEN_IMPORT.test("import { x } from '@/modules/ai/calibration/intake-service';")).toBe(true);
    expect(FORBIDDEN_IMPORT.test("export { y } from '@/modules/ai/calibration/freeze';")).toBe(true);
    expect(FORBIDDEN_IMPORT.test("const m = await import('@/modules/ai/calibration/freeze');")).toBe(true);
    expect(FORBIDDEN_IMPORT.test("import '@/modules/ai/calibration/side-effect';")).toBe(true);
    expect(FORBIDDEN_IMPORT.test("const m = require('../../modules/ai/calibration/marking');")).toBe(true);
    // Negative control — prose is not an import.
    expect(FORBIDDEN_IMPORT.test('// see src/modules/ai/calibration/__tests__/corpus-availability.ts')).toBe(false);
  });

  it("no file outside the calibration module and its allowed consumers imports it", () => {
    const allowedDirs = [
      join(PROJECT_ROOT, "src", "modules", "ai", "calibration"),
      join(PROJECT_ROOT, "src", "modules", "ai", "calibration", "__tests__"),
    ];
    const allowedFiles = new Set([
      join(PROJECT_ROOT, "src", "modules", "ai", "evaluation", "golden-runner.ts"),
      join(PROJECT_ROOT, "scripts", "ingest-calibration.ts"),
      join(PROJECT_ROOT, "scripts", "calibration.ts"),
    ]);
    const srcDir = join(PROJECT_ROOT, "src");
    const violations: string[] = [];
    for (const file of walk(srcDir)) {
      const insideAllowed = allowedDirs.some(d => file.startsWith(d));
      if (insideAllowed || allowedFiles.has(file)) continue;
      const content = readFileSync(file, "utf-8");
      if (FORBIDDEN_IMPORT.test(content)) {
        violations.push(file);
      }
    }
    expect(violations, `forbidden runtime imports:\n${violations.join("\n")}`)
      .toEqual([]);
    // Repo-wide IO-bound scan (≈700 files, every one read). The default 5s budget
    // is ample in isolation but is exceeded when 200+ suites run in parallel on a
    // saturated machine — measured 2026-10-10: the failure was a TIMEOUT, never an
    // assertion. The assertion itself is unchanged.
  }, 30_000);
});
