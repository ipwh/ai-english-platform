// ============================================
// R3.10-K Phase 3 — WritingCoachService canonical-scoring contract
// The compatibility path must never present an independent authoritative
// Paper 2 score, and must never convert failure into a zero mark.
// ============================================

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ai/services/llm-call", () => ({ callLLM: vi.fn() }));

import { callLLM } from "@/modules/ai/services/llm-call";
import {
  writingCoachService,
  WritingScoringUnavailableError,
} from "../services/writing-coach-service";
import type { EssaySubmission } from "../types";

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

const essay: EssaySubmission = {
  studentId: "s1",
  essayId: "e1",
  title: "Test",
  content: "I think recycling is good for the environment.",
  textType: "essay",
  gradeLevel: "S4",
  wordCount: 9,
  submittedAt: new Date().toISOString(),
};

function mockAnalysis(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    overall: {
      totalScore: 21,
      contentScore: 7,
      languageScore: 7,
      organizationScore: 7,
      estimatedLevel: "5**",
      summary: "Great.",
      summaryZh: "很好。",
      ...overrides,
    },
    strengths: [],
    weaknesses: [],
    grammarErrors: [],
    vocabularySuggestions: [],
    coherenceFeedback: { suggestions: [], suggestionsZh: [] },
    organizationFeedback: {
      hasClearIntroduction: true,
      hasClearConclusion: true,
      paragraphCount: 1,
      suggestions: [],
      suggestionsZh: [],
    },
    taskFulfillment: {
      addressedAllParts: true,
      wordCountAdequate: true,
      textTypeAppropriate: true,
      toneAppropriate: true,
      comments: "",
      commentsZh: "",
    },
    revisionPlan: { priorityActions: [], estimatedTimeMinutes: 15, focusAreas: [], focusAreasZh: [] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WritingCoachService — deterministic canonical scoring", () => {
  it("LLM totalScore is NEVER authoritative: total = normalized C+L+O", async () => {
    mockCallLLM.mockResolvedValueOnce(mockAnalysis({
      totalScore: 21,          // LLM claims full marks
      contentScore: 1,         // but C=1
      languageScore: 1,        // L=1
      organizationScore: 1,    // O=1
    }));
    const review = await writingCoachService.analyzeEssay(essay);
    expect(review.totalScore).toBe(3);
    expect(review.rubricScores.hkdse.total).toBe(3);
  });

  it("LLM estimatedLevel is NEVER authoritative: level derived from canonical total", async () => {
    mockCallLLM.mockResolvedValueOnce(mockAnalysis({
      totalScore: 3,
      contentScore: 1,
      languageScore: 1,
      organizationScore: 1,
      estimatedLevel: "5**",
    }));
    const review = await writingCoachService.analyzeEssay(essay);
    expect(review.estimatedLevel).toBe("1");
    expect(review.rubricScores.overallBand).toBe("1");
  });

  it("full marks: C=L=O=7 → total 21, level 5, CEFR C1 (platform mapping only)", async () => {
    mockCallLLM.mockResolvedValueOnce(mockAnalysis());
    const review = await writingCoachService.analyzeEssay(essay);
    expect(review.totalScore).toBe(21);
    expect(review.estimatedLevel).toBe("5");
    expect(review.rubricScores.cefr.overall).toBe("C1");
  });

  it("carries the canonical scoringVersion", async () => {
    mockCallLLM.mockResolvedValueOnce(mockAnalysis());
    const review = await writingCoachService.analyzeEssay(essay);
    expect(review.scoringVersion).toBe("HKDSE_P2_WRITING_CANONICAL_V1");
  });
});

describe("WritingCoachService — fail closed (never a fake zero)", () => {
  it("missing C/L/O → SCORING_UNAVAILABLE (no numeric score fields)", async () => {
    mockCallLLM.mockResolvedValueOnce(mockAnalysis({
      totalScore: 15,
      contentScore: undefined,
      languageScore: undefined,
      organizationScore: undefined,
      estimatedLevel: "4",
    }));
    await expect(writingCoachService.analyzeEssay(essay))
      .rejects.toBeInstanceOf(WritingScoringUnavailableError);
    await expect(writingCoachService.analyzeEssay(essay))
      .rejects.toMatchObject({ status: "SCORING_UNAVAILABLE", retryable: true });
  });

  it("model/infrastructure failure → SCORING_UNAVAILABLE, not score 0", async () => {
    mockCallLLM.mockRejectedValueOnce(new Error("network down"));
    await expect(writingCoachService.analyzeEssay(essay))
      .rejects.toBeInstanceOf(WritingScoringUnavailableError);
    await expect(writingCoachService.analyzeEssay(essay))
      .rejects.toMatchObject({ status: "SCORING_UNAVAILABLE", retryable: true });
  });

  it("incomplete AI JSON (no overall block) → SCORING_UNAVAILABLE", async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({ strengths: [] }));
    await expect(writingCoachService.analyzeEssay(essay))
      .rejects.toBeInstanceOf(WritingScoringUnavailableError);
  });
});
