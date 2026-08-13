// ============================================
// R3.10-K Phase 5 — Model Essay Generation Quality Gate Contract
// The gate judges pedagogical FIT only — it is NOT a scoring engine.
// Invariants:
//   - gate output is booleans only (never a score / level)
//   - failure after max attempts is fail-closed (MODEL_GENERATION_UNAVAILABLE)
//   - generated essay retains server-built artifact metadata
// ============================================

import { describe, expect, it } from "vitest";
import {
  generateModelEssayWithQualityGate,
  parseQualityVerdict,
  buildModelEssaySystemPrompt,
  buildQualityGateSystemPrompt,
  ModelGenerationUnavailableError,
  MODEL_ESSAY_MAX_ATTEMPTS,
} from "../core/model-essay-generation";

function essayJson(text: string): string {
  return JSON.stringify({ essay: text });
}

function judgePass(): string {
  return JSON.stringify({
    targetFit: true,
    contentFit: true,
    languageFit: true,
    organizationFit: true,
    sophisticationFit: true,
    issues: [],
  });
}

function judgeFail(): string {
  return JSON.stringify({
    targetFit: false,
    contentFit: false,
    languageFit: false,
    organizationFit: false,
    sophisticationFit: false,
    issues: ["essay too sophisticated for target"],
  });
}

describe("Quality gate — booleans only, never a scoring authority", () => {
  it("parseQualityVerdict returns booleans and ignores rogue numeric fields", () => {
    const verdict = parseQualityVerdict(
      JSON.stringify({
        targetFit: true,
        contentFit: true,
        languageFit: true,
        organizationFit: true,
        sophisticationFit: true,
        issues: [],
        score: 78,          // rogue second-authority fields are ignored
        dseLevel: 3,
      }),
    );
    expect(verdict?.targetFit).toBe(true);
    expect((verdict as unknown as { score?: number }).score).toBeUndefined();
    expect((verdict as unknown as { dseLevel?: number }).dseLevel).toBeUndefined();
  });

  it("judge prompt forbids numeric scores and levels", () => {
    const prompt = buildQualityGateSystemPrompt({ target: "mid" });
    expect(prompt).toContain("BOOLEAN");
    expect(prompt).toContain("Do NOT return any numeric score or level");
  });

  it("generation prompt never instructs artificial errors (mid = correct but less sophisticated)", () => {
    const prompt = buildModelEssaySystemPrompt({ target: "mid", textType: "essay", words: 200 });
    expect(prompt).toContain("DO NOT deliberately insert grammar mistakes");
    expect(prompt).toContain("CORRECT but LESS SOPHISTICATED");
  });
});

describe("Generation orchestration — target metadata server-determined", () => {
  it("pass on first attempt returns essay + verified metadata", async () => {
    const calls: string[] = [];
    const result = await generateModelEssayWithQualityGate(
      { topic: "Recycling", target: "mid" },
      {
        generate: async () => {
          calls.push("generate");
          return essayJson("A simple correct essay about recycling.");
        },
        judge: async () => {
          calls.push("judge");
          return judgePass();
        },
      },
    );
    expect(result.essay).toContain("recycling");
    expect(result.metadata).toMatchObject({
      source: "generated_model",
      generationTarget: "mid",
      pedagogicalTargetLevel: "3",
      generationVersion: "MODEL_ESSAY_GENERATION_V1",
      qualityStatus: "verified",
    });
    expect(calls).toEqual(["generate", "judge"]);
  });

  it("retries on gate failure and succeeds within max attempts", async () => {
    let generateCount = 0;
    const result = await generateModelEssayWithQualityGate(
      { topic: "Recycling", target: "mid" },
      {
        generate: async () => {
          generateCount++;
          return essayJson("Simple essay attempt.");
        },
        judge: async () => (generateCount === 1 ? judgeFail() : judgePass()),
      },
    );
    expect(generateCount).toBe(2);
    expect(result.metadata.qualityStatus).toBe("verified");
  });

  it("fail-closed after max attempts: never returns an unverified essay", async () => {
    let generateCount = 0;
    await expect(
      generateModelEssayWithQualityGate(
        { topic: "Recycling", target: "mid" },
        {
          generate: async () => {
            generateCount++;
            return essayJson("Attempt text.");
          },
          judge: async () => judgeFail(),
        },
      ),
    ).rejects.toBeInstanceOf(ModelGenerationUnavailableError);
    expect(generateCount).toBe(MODEL_ESSAY_MAX_ATTEMPTS);
  });

  it("judge parse failure counts as a failed attempt (never silently passes)", async () => {
    await expect(
      generateModelEssayWithQualityGate(
        { topic: "Recycling", target: "mid" },
        {
          generate: async () => essayJson("Text."),
          judge: async () => "not json at all",
        },
      ),
    ).rejects.toBeInstanceOf(ModelGenerationUnavailableError);
  });

  it("empty generated essay counts as a failed attempt", async () => {
    await expect(
      generateModelEssayWithQualityGate(
        { topic: "Recycling", target: "mid" },
        {
          generate: async () => JSON.stringify({ essay: "" }),
          judge: async () => judgePass(),
        },
      ),
    ).rejects.toBeInstanceOf(ModelGenerationUnavailableError);
  });
});
