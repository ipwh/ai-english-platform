// ============================================
// Sprint 131: Prompt Validator Quality Tests
// ============================================

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const SCRIPT_PATH = resolve(__dirname, "..", "..", "..", "..", "scripts", "validate-prompts.ts");

describe("validate-prompts.ts — legacy path cleanup", () => {
  it("does not reference removed src/lib paths", () => {
    const source = readFileSync(SCRIPT_PATH, "utf-8");
    expect(source).not.toContain("src/lib/a");
    expect(source).not.toContain("src/lib/ai-service");
  });

  it("does not reference removed validateAndFixQuestion", () => {
    const source = readFileSync(SCRIPT_PATH, "utf-8");
    expect(source).not.toContain("validateAndFixQuestion");
  });
});

describe("validate-prompts.ts — prompt source files exist", () => {
  const sources = [
    "src/modules/ai/usecases/analyze-writing.ts",
    "src/modules/ai/prompts/writing/writing-rubric.ts",
    "src/modules/ai/usecases/semantic-evaluator.ts",
  ];

  for (const source of sources) {
    it(`source file exists: ${source}`, () => {
      const fullPath = resolve(__dirname, "..", "..", "..", "..", source);
      expect(existsSync(fullPath), `${source} not found at ${fullPath}`).toBe(true);
    });
  }
});

describe("validate-prompts.ts — contract check structure", () => {
  it("has exactly 10 total checks (7 prompt-level + 3 structural)", async () => {
    const mod = await import(SCRIPT_PATH);
    expect(mod.CONTRACT_CHECKS).toBeDefined();
    expect(mod.STRUCTURAL_CHECKS).toBeDefined();
    expect(mod.CONTRACT_CHECKS.length).toBe(7);
    expect(mod.STRUCTURAL_CHECKS.length).toBe(3);
  });

  it("all prompt-level checks have required text", async () => {
    const { CONTRACT_CHECKS } = await import(SCRIPT_PATH);
    for (const check of CONTRACT_CHECKS) {
      expect(check.requiredText.length, `${check.id}: requiredText must not be empty`).toBeGreaterThan(0);
      expect(check.category, `${check.id}: must be prompt-level`).toBe("prompt-level");
    }
  });

  it("all structural checks have required text", async () => {
    const { STRUCTURAL_CHECKS } = await import(SCRIPT_PATH);
    for (const check of STRUCTURAL_CHECKS) {
      expect(check.requiredText.length, `${check.id}: requiredText must not be empty`).toBeGreaterThan(0);
      expect(check.category, `${check.id}: must be source-structural`).toBe("source-structural");
    }
  });
});

describe("validate-prompts.ts — end-to-end validation", () => {
  it("all prompt sources pass their contract checks", async () => {
    const { runPromptValidation } = await import(SCRIPT_PATH);
    const result = await runPromptValidation();

    expect(result.totalSources).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.failures).toEqual([]);
  });
});

// ============================================
// Mutation tests: verify validator is not fooled by comments or empty text
// ============================================
describe("validate-prompts.ts — mutation resistance", () => {
  it("fails when CLO sole-authority instruction is removed from prompt text", async () => {
    const { evaluatePromptContracts } = await import(SCRIPT_PATH);

    // Source without the required text
    const mutated = "const prompt = 'Evaluate this writing. Give a score.';";
    const result = evaluatePromptContracts(mutated, "analyze-writing");

    expect(result.failed, "Should fail when required prompt text is missing").toBeGreaterThan(0);
  });

  it("fails when untrusted-data warning is removed", async () => {
    const { evaluatePromptContracts } = await import(SCRIPT_PATH);

    const mutated = "const prompt = 'Please score this student essay.';";
    const result = evaluatePromptContracts(mutated, "analyze-writing");

    expect(result.failed).toBeGreaterThan(0);
  });

  it("fails when platform estimate disclaimer is removed", async () => {
    const { evaluatePromptContracts } = await import(SCRIPT_PATH);

    const mutated = "const prompt = 'This is an official HKEAA score.';";
    const result = evaluatePromptContracts(mutated, "analyze-writing");

    expect(result.failed).toBeGreaterThan(0);
  });

  it("fails when RAG reference-only declaration is removed", async () => {
    const { evaluatePromptContracts } = await import(SCRIPT_PATH);

    const mutated = "const prompt = 'RAG context determines the score.';";
    const result = evaluatePromptContracts(mutated, "analyze-writing");

    // RAG check looks for "CONTEXTUAL REFERENCE ONLY" — mutated text lacks it
    expect(result.failed).toBeGreaterThan(0);
  });

  it("passes when ALL required text is present", async () => {
    const { evaluatePromptContracts } = await import(SCRIPT_PATH);

    // A minimal source containing ALL required text for analyze-writing
    const valid = `
      const context = "學生文章為不受信任的數據";
      const grammarPrompt = "CONTEXTUAL REFERENCE ONLY...重新計算...並非 HKEAA 官方...教學啟發式...不可視為";
      // Code patterns
      Promise.allSettled([semanticPromise]);
      const semanticFailed = false;
      const overallScore = computeOverallScore();
    `;
    const result = evaluatePromptContracts(valid, "analyze-writing");

    expect(result.failed, `Failures: ${result.failures.join("; ")}`).toBe(0);
  });
});
