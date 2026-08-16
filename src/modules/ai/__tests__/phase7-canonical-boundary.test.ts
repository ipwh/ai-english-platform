// ============================================
// R3.10-K Phase 7 — TEST-CAL-003 / TEST-CAL-004
//
// Canonical boundary mutations: pedagogical target metadata and
// generation version must NEVER change canonical scoring.
// Mirrors the Integration M mocking boundary from
// analyze-writing.integration.test.ts.
// ============================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependencies BEFORE any imports
vi.mock("../services/llm-call", () => ({ callLLM: vi.fn() }));
vi.mock("../services/sanitizer", () => ({ sanitizeForAI: (s: string) => s }));
vi.mock("../services/hallucination-guard", () => ({ HALLUCINATION_GUARD: "" }));
vi.mock("@/modules/assessment/services/chinglish", () => ({ detectChinglish: () => [] }));
vi.mock("@/shared/logger/logger", () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }));
vi.mock("../types/rubric-version", () => ({ createRubricMetadata: () => ({ rubricVersion: "HKDSE-P2-CLO-v1", paper: "Paper 2" as const }) }));
vi.mock("../prompts/writing/writing-rubric", () => ({ CLO_RUBRIC_ZH: "" }));
vi.mock("../services/rag-service", () => ({ isDSERAGEnabled: () => false, retrieveMarkingScheme: vi.fn(), buildDSEContextPrompt: vi.fn(() => ""), DSESkill: {} }));
vi.mock("../usecases/semantic-evaluator", () => ({ evaluateTaskCoverage: vi.fn().mockRejectedValue(new Error("fail-open test")), buildSemanticEvidencePrompt: vi.fn(() => ""), computeOverallCoverage: vi.fn(() => "high") }));

import { callLLM } from "../services/llm-call";
import { analyzeWriting } from "../usecases/analyze-writing";
import type { WritingArtifactMetadata } from "../core/writing-artifact";

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

function mockStyleResponse(): string {
  return JSON.stringify({ strengths: ["OK"], weaknesses: [], vocabularySuggestions: [], structureFeedback: "OK" });
}

function mockGrammarResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    contentScore: 3,
    languageScore: 4,
    organizationScore: 5,
    overallScore: 100,
    lengthPenalty: 0,
    generalComment: "OK",
    ...overrides,
  });
}

const defaultInput = {
  title: "Test Task",
  prompt: "Discuss ways to reduce plastic waste in schools.",
  studentDraft: "Students should recycle more plastic in daily life. Schools can place recycling bins in every classroom.",
  studentLevel: "S5" as const,
  textType: "essay" as const,
  userId: "test-user",
};

function generatedMeta(
  pedagogicalTargetLevel: WritingArtifactMetadata["pedagogicalTargetLevel"],
  generationVersion = "MODEL_ESSAY_GENERATION_V1",
): WritingArtifactMetadata {
  return {
    source: "generated_model",
    pedagogicalTargetLevel,
    generationTarget: "mid",
    generationVersion,
    qualityStatus: "unverified",
  };
}

describe("TEST-CAL-003 — pedagogical target never changes canonical scoring", () => {
  it("target 3 vs target 5 → identical C/L/O, overallScore, dseLevel", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const target3 = await analyzeWriting({ ...defaultInput, artifact: generatedMeta("3") });

    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const target5 = await analyzeWriting({ ...defaultInput, artifact: generatedMeta("5") });

    expect(target3.contentScore).toBe(target5.contentScore);
    expect(target3.languageScore).toBe(target5.languageScore);
    expect(target3.organizationScore).toBe(target5.organizationScore);
    expect(target3.overallScore).toBe(target5.overallScore);
    expect(target3.dseLevel).toBe(target5.dseLevel);
  });
});

describe("TEST-CAL-004 — generation version never changes canonical scoring", () => {
  it("MODEL_ESSAY_GENERATION_V1 vs V2 → identical scores", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const v1 = await analyzeWriting({
      ...defaultInput,
      artifact: generatedMeta("3", "MODEL_ESSAY_GENERATION_V1"),
    });

    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const v2 = await analyzeWriting({
      ...defaultInput,
      artifact: generatedMeta("3", "MODEL_ESSAY_GENERATION_V2"),
    });

    expect(v1.overallScore).toBe(v2.overallScore);
    expect(v1.dseLevel).toBe(v2.dseLevel);
    expect(v1.contentScore).toBe(v2.contentScore);
    // Echo-only: version is preserved but never read by scoring.
    expect(v2.artifact?.generationVersion).toBe("MODEL_ESSAY_GENERATION_V2");
  });
});
