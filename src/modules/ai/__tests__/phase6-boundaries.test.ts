// ============================================
// R3.10-K Phase 6 — Source-of-Truth & Boundary Guards
// Architecture tests proving:
//   - generation code never imports canonical scoring policy
//   - canonical scorer never imports generation logic
//   - quality gate never calls the canonical scorer
//   - legacy model-essays route is deprecated and consumerless
// ============================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const src = (rel: string) => readFileSync(join(ROOT, "src", rel), "utf-8");
const importLines = (content: string) =>
  content.split("\n").filter((l) => l.trim().startsWith("import")).join("\n");

// Import-path matchers: comments may legitimately mention the scorer, so
// guards only assert on actual import statements.
const IMPORTS_SCORE_POLICY = /from ["'].*writing-score-policy["']/;
const IMPORTS_ANALYZE_WRITING = /from ["'].*analyze-writing["']/;
const IMPORTS_GENERATION = /from ["'].*model-essay-generation["']/;
const IMPORTS_DSEL = /estimateDSELevelFromCLO/;


describe("Source-of-truth guards — generation vs scoring isolation", () => {
  it("model-essay-generation.ts never imports the scoring policy", () => {
    const content = importLines(src("modules/ai/core/model-essay-generation.ts"));
    expect(content).not.toMatch(IMPORTS_SCORE_POLICY);
    expect(content).not.toMatch(IMPORTS_ANALYZE_WRITING);
    expect(content).not.toMatch(IMPORTS_DSEL);
  });

  it("analyze-writing.ts never imports generation logic (artifact is type-only echo)", () => {
    const content = src("modules/ai/usecases/analyze-writing.ts");
    const imports = importLines(content);
    expect(imports).not.toMatch(IMPORTS_GENERATION);
    expect(imports).not.toContain("generationTargetToPedagogicalLevel");
    // The only artifact import must be type-only.
    expect(imports).toMatch(/import type \{[^}]*WritingArtifactMetadata[^}]*\} from ["'].*writing-artifact["'];/);
    expect(imports).not.toMatch(/import \{[^}]*WritingArtifactMetadata[^}]*\} from ["'].*writing-artifact["'];/);
  });

  it("writing-score-policy.ts contains no pedagogical/artifact references", () => {
    const content = src("modules/ai/core/writing-score-policy.ts");
    expect(content).not.toContain("pedagogical");
    expect(content).not.toContain("artifact");
    expect(content).not.toContain("generationTarget");
  });

  it("quality gate module never imports the canonical scorer", () => {
    const content = importLines(src("modules/ai/core/model-essay-generation.ts"));
    expect(content).not.toMatch(IMPORTS_SCORE_POLICY);
    expect(content).not.toMatch(IMPORTS_ANALYZE_WRITING);
  });

  it("canonical scorer module never imports the quality gate", () => {
    const content = importLines(src("modules/ai/usecases/analyze-writing.ts"));
    expect(content).not.toMatch(IMPORTS_GENERATION);
    expect(content).not.toContain("parseQualityVerdict");
  });
});

describe("Legacy route guards — /api/writing/model-essays", () => {
  it("has been removed (zero runtime consumers)", () => {
    // R3.10-L audit: the deprecated /api/writing/model-essays route and its
    // writing-coach siblings were deleted. The canonical model-essay path is
    // /api/ai/generate-model-essay (Zod-validated, quality-gated).
    expect(() => src("app/api/writing/model-essays/route.ts")).toThrow();
  });
});

describe("Generation endpoint contract", () => {
  it("returns server-built metadata with all required fields", () => {
    const content = src("app/api/ai/generate-model-essay/route.ts");
    expect(content).toContain("metadata: result.metadata");
    expect(content).toContain("MODEL_GENERATION_UNAVAILABLE");
    expect(content).toContain("SERVER-DETERMINED");
  });
});
