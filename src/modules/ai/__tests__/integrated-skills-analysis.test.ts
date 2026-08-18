// ============================================
// Integrated Skills analysis — deterministic cross-paper level override
// The LLM's estimatedLevel is NEVER authoritative; it is recomputed from
// overallScore so Paper 3 agrees with Paper 2 at the same percentage.
// ============================================

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../services/ai-execution", () => ({ executeAI: vi.fn() }));
vi.mock("../services/sanitizer", () => ({ sanitizeForAI: (s: string) => s }));
vi.mock("../services/rag-service", () => ({
  isDSERAGEnabled: () => false,
  retrieveMarkingScheme: vi.fn(),
  buildDSEContextPrompt: vi.fn(() => ""),
}));
vi.mock("@/shared/logger/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { analyzeIntegratedSkills } from "../usecases/integrated-skills-analysis";
import { executeAI } from "../services/ai-execution";
import type { IntegratedSkillsAnalysis, AnalyzeIntegratedSkillsInput } from "../usecases/integrated-skills-types";

const executeAIMock = vi.mocked(executeAI);

function baseAnalysis(overrides: Partial<IntegratedSkillsAnalysis> = {}): IntegratedSkillsAnalysis {
  return {
    overallScore: 78,
    listeningAccuracy: 80,
    writingQuality: 75,
    contentCompleteness: 80,
    languageAccuracy: 70,
    organizationClarity: 80,
    capturedPoints: [],
    missedPoints: [],
    overCopyWarnings: [],
    grammarErrors: [],
    vocabularySuggestions: [],
    structureFeedback: "ok",
    generalComment: "ok",
    improvementTips: [],
    estimatedLevel: "Level 4", // LLM claim — MUST be overridden
    ...overrides,
  };
}

const input: AnalyzeIntegratedSkillsInput = {
  listeningContent: "script",
  noteTakingGuide: [],
  expectedContentPoints: [],
  writingTask: "Write a summary",
  taskType: "summary",
  studentNotes: "",
  studentWriting: "answer",
};

describe("analyzeIntegratedSkills — estimatedLevel is deterministic, never the LLM claim", () => {
  beforeEach(() => executeAIMock.mockReset());

  it("overrides the LLM level with the percentage mapping (78 → 5)", async () => {
    executeAIMock.mockResolvedValue(baseAnalysis());
    const result = await analyzeIntegratedSkills(input);
    expect(result.overallScore).toBe(78);
    expect(result.estimatedLevel).toBe("5");
  });

  it("maps boundary percentages to the Paper 2-equivalent level", async () => {
    executeAIMock
      .mockResolvedValueOnce(baseAnalysis({ overallScore: 62, estimatedLevel: "Level 1" }))
      .mockResolvedValueOnce(baseAnalysis({ overallScore: 33, estimatedLevel: "Level 5" }))
      .mockResolvedValueOnce(baseAnalysis({ overallScore: 32, estimatedLevel: "Level 5" }));

    expect((await analyzeIntegratedSkills(input)).estimatedLevel).toBe("4");
    expect((await analyzeIntegratedSkills(input)).estimatedLevel).toBe("2");
    expect((await analyzeIntegratedSkills(input)).estimatedLevel).toBe("1");
  });
});
