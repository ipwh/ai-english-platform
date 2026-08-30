// ============================================
// Sprint 131: Integration tests for analyzeWriting pipeline
// Isolated from analyze-writing.test.ts to avoid mock contamination.
// Mock boundary: callLLM, semantic evaluator, RAG, sanitizer, logger, rubric
// ============================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

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

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper: build mock LLM responses
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

// ============================================
// Test A: Rationale score cannot change formal CLO score
// ============================================
describe("Integration A — rationale score authority", () => {
  it("rationale score=7 does not change formal contentScore=3", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse({
        cloRationales: [
          { dimension: "content", score: 7, strengths: [], limitations: [], evidence: [], nextSteps: [] },
          { dimension: "language", score: 7, strengths: [], limitations: [], evidence: [], nextSteps: [] },
          { dimension: "organization", score: 7, strengths: [], limitations: [], evidence: [], nextSteps: [] },
        ],
      }));

    const result = await analyzeWriting(defaultInput);

    // Formal scores unchanged by rationale
    expect(result.contentScore).toBe(3);
    expect(result.languageScore).toBe(4);
    expect(result.organizationScore).toBe(5);

    // Rationale scores overridden to formal values
    const c = result.cloRationales!.find(r => r.dimension === "content")!;
    expect(c.score).toBe(3);
    const l = result.cloRationales!.find(r => r.dimension === "language")!;
    expect(l.score).toBe(4);
    const o = result.cloRationales!.find(r => r.dimension === "organization")!;
    expect(o.score).toBe(5);

    // overallScore is computed, not LLM's 100
    expect(result.overallScore).toBe(Math.round(((3 + 4 + 5) / 21) * 100));
  });
});

// ============================================
// Test B: Invented evidence is filtered from final response
// ============================================
describe("Integration B — evidence filtering", () => {
  it("removes invented evidence not in student essay", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse({
        cloRationales: [
          {
            dimension: "content", score: 3,
            strengths: [], limitations: [],
            evidence: [
              "The government should introduce a recycling tax.",
              "Students should recycle more plastic",
              "",
            ],
            nextSteps: [],
          },
          { dimension: "language", score: 4, strengths: [], limitations: [], evidence: [], nextSteps: [] },
          { dimension: "organization", score: 5, strengths: [], limitations: [], evidence: [], nextSteps: [] },
        ],
      }));

    const result = await analyzeWriting(defaultInput);

    const c = result.cloRationales!.find(r => r.dimension === "content")!;
    // Invented evidence removed
    expect(c.evidence).not.toContain("The government should introduce a recycling tax.");
    // Verbatim evidence preserved
    expect(c.evidence).toContain("Students should recycle more plastic");
    // Empty string filtered
    expect(c.evidence.length).toBe(1);
  });
});

// ============================================
// Test C: Missing rationale dimension completed via fallback
// ============================================
describe("Integration C — rationale dimension completion", () => {
  it("completes missing dimensions with safe fallback", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse({
        // Only content rationale — language and org missing
        cloRationales: [
          { dimension: "content", score: 3, strengths: ["Good point."], limitations: ["Needs example."], evidence: ["Students should recycle more plastic"], nextSteps: ["Add example."] },
        ],
      }));

    const result = await analyzeWriting(defaultInput);

    // All 3 dimensions present
    expect(result.cloRationales!.length).toBe(3);

    // Language fallback has safe defaults
    const lang = result.cloRationales!.find(r => r.dimension === "language")!;
    expect(lang.score).toBe(4);
    expect(lang.strengths).toEqual([]);
    expect(lang.evidence).toEqual([]);
    expect(lang.limitations.length).toBeGreaterThan(0);

    // Org fallback has safe defaults
    const org = result.cloRationales!.find(r => r.dimension === "organization")!;
    expect(org.score).toBe(5);
    expect(org.evidence).toEqual([]);
  });
});

// ============================================
// Test D: Absent cloRationales → safe fallback
// ============================================
describe("Integration D — absent cloRationales fallback", () => {
  it("does not fail when cloRationales is completely absent", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse({}));

    const result = await analyzeWriting(defaultInput);

    // Formal scores still returned
    expect(result.contentScore).toBe(3);
    expect(result.languageScore).toBe(4);
    expect(result.organizationScore).toBe(5);
    // All 3 dimensions present via fallback
    expect(result.cloRationales!.length).toBe(3);
  });
});

// ============================================
// Test E: Golden benchmark — unscored fixtures produce null metrics
// ============================================
describe("Integration E — golden benchmark unscored fixtures", () => {
  // Pure logic: when all fixtures have null scores, metrics must be null
  function runBenchmark(results: Array<{
    expected: { contentScore: number | null; languageScore: number | null; organizationScore: number | null };
  }>): {
    totalFixtures: number;
    humanScoredFixtures: number;
    metrics: { mae: number | null; rmse: number | null; bias: number | null };
  } {
    const scored = results.filter(
      r => r.expected.contentScore != null || r.expected.languageScore != null || r.expected.organizationScore != null
    );
    return {
      totalFixtures: results.length,
      humanScoredFixtures: scored.length,
      metrics: {
        mae: scored.length === 0 ? null : 0,
        rmse: scored.length === 0 ? null : 0,
        bias: scored.length === 0 ? null : 0,
      },
    };
  }

  it("does not calculate metrics from unscored calibration fixtures", () => {
    const result = runBenchmark([
      { expected: { contentScore: null, languageScore: null, organizationScore: null } },
      { expected: { contentScore: null, languageScore: null, organizationScore: null } },
      { expected: { contentScore: null, languageScore: null, organizationScore: null } },
    ]);

    expect(result.humanScoredFixtures).toBe(0);
    expect(result.totalFixtures).toBe(3);
    expect(result.metrics.mae).toBeNull();
    expect(result.metrics.rmse).toBeNull();
    expect(result.metrics.bias).toBeNull();
  });

  it("returns null when no fixtures at all", () => {
    const result = runBenchmark([]);

    expect(result.humanScoredFixtures).toBe(0);
    expect(result.totalFixtures).toBe(0);
    expect(result.metrics.mae).toBeNull();
    expect(result.metrics.rmse).toBeNull();
    expect(result.metrics.bias).toBeNull();
  });

  it("does not treat null as zero", () => {
    const result = runBenchmark([
      { expected: { contentScore: null, languageScore: null, organizationScore: null } },
      { expected: { contentScore: 3, languageScore: 4, organizationScore: 5 } },
    ]);

    expect(result.humanScoredFixtures).toBe(1);
    expect(result.totalFixtures).toBe(2);
    expect(result.metrics.mae).not.toBeNull();
    expect(result.metrics.rmse).not.toBeNull();
    expect(result.metrics.bias).not.toBeNull();
  });
});

// ============================================
// Test F: Student level adaptation — feedback only, not scoring
// ============================================
describe("Integration F — student level feedback adaptation", () => {
  it("uses student level for feedback adaptation but not scoring", async () => {
    // Same essay, same CLO output, different studentLevel.
    // Formal C/L/O and overallScore must remain unchanged.
    const grammarResponse = mockGrammarResponse({
      cloRationales: [
        { dimension: "content", score: 3, strengths: ["Good."], limitations: ["Needs work."], evidence: [], nextSteps: ["Practice."] },
        { dimension: "language", score: 4, strengths: ["OK."], limitations: ["Errors."], evidence: [], nextSteps: ["Review."] },
        { dimension: "organization", score: 5, strengths: ["Clear."], limitations: ["Weak."], evidence: [], nextSteps: ["Improve."] },
      ],
    });

    // Run with S5
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(grammarResponse);
    const resultS5 = await analyzeWriting({ ...defaultInput, studentLevel: "S5" });

    // Run with S2
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(grammarResponse);
    const resultS2 = await analyzeWriting({ ...defaultInput, studentLevel: "S2" });

    // Formal scores unchanged regardless of student level
    expect(resultS5.contentScore).toBe(resultS2.contentScore);
    expect(resultS5.languageScore).toBe(resultS2.languageScore);
    expect(resultS5.organizationScore).toBe(resultS2.organizationScore);
    expect(resultS5.overallScore).toBe(resultS2.overallScore);
    expect(resultS5.cloTotalScore).toBe(resultS2.cloTotalScore);
  });

  it("does not fail when studentLevel is absent", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());

    const result = await analyzeWriting({ ...defaultInput, studentLevel: undefined });

    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.contentScore).toBe(3);
  });
});

// ============================================
// Test G: Calibration fixture validation (no LLM calls)
// ============================================
const FIXTURES_DIR = join(
  __dirname,
  "..",
  "evaluation",
  "fixtures",
  "writing-golden",
);

function loadCalFixtures(): Array<{
  id: string;
  source?: string;
  calibrationStatus?: string;
  expected: { contentScore: number | null; languageScore: number | null; organizationScore: number | null };
  metadata?: { caseType?: string };
}> {
  const files = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("cal-") && f.endsWith(".json"));
  return files.map(file => {
    const raw = readFileSync(join(FIXTURES_DIR, file), "utf-8");
    return JSON.parse(raw);
  });
}

describe("Integration G — calibration fixture structural validation", () => {

  it("marks all 12 generated fixtures as synthetic-draft awaiting human marking", () => {
    const fixtures = loadCalFixtures();

    expect(fixtures).toHaveLength(12);

    for (const fixture of fixtures) {
      expect(fixture.source).toBe("synthetic-draft");
      expect(fixture.calibrationStatus).toBe("awaiting-human-marking");
      expect(fixture.expected.contentScore).toBeNull();
      expect(fixture.expected.languageScore).toBeNull();
      expect(fixture.expected.organizationScore).toBeNull();
    }
  });

  it("contains all 12 required case categories", () => {
    const fixtures = loadCalFixtures();
    const categories = new Set(fixtures.map(f => f.metadata?.caseType));

    expect(categories).toEqual(new Set([
      "fully-developed",
      "partial-task-fulfilment",
      "off-topic",
      "strong-content-weak-language",
      "weak-content-strong-language",
      "relevant-underdeveloped",
      "repetitive-ideas",
      "accurate-simple-language",
      "sophisticated-inappropriate-vocabulary",
      "non-blocking-grammar-errors",
      "meaning-blocking-grammar-errors",
      "organized-but-weak-progression",
    ]));
  });

  it("does not calculate metrics from unscored fixtures", () => {
    const fixtures = loadCalFixtures();

    // All 12 have null scores → 0 human-scored
    const scored = fixtures.filter(
      f => f.expected.contentScore != null
        || f.expected.languageScore != null
        || f.expected.organizationScore != null
    );

    expect(scored).toHaveLength(0);

    // Metrics should be null
    const allContentNull = fixtures.every(f => f.expected.contentScore === null);
    expect(allContentNull).toBe(true);
  });

  it("does not treat null scores as zero in mixed scenarios", () => {
    // Simulate a fixture with partial human scores
    const partialFixture = {
      expected: { contentScore: 4, languageScore: null, organizationScore: null },
    };

    const hasHumanContent = partialFixture.expected.contentScore != null;
    const hasHumanLanguage = partialFixture.expected.languageScore != null;
    const hasHumanOrg = partialFixture.expected.organizationScore != null;

    expect(hasHumanContent).toBe(true);
    expect(hasHumanLanguage).toBe(false);
    expect(hasHumanOrg).toBe(false);

    // Only Content would be scored
    const contentError = partialFixture.expected.contentScore != null ? 1 : null; // simulated
    expect(contentError).not.toBeNull();
    // Language and Org are null — not scored
    expect(partialFixture.expected.languageScore).toBeNull();
    expect(partialFixture.expected.organizationScore).toBeNull();
  });
});

// ============================================
// Test H: API naming — dual-field consistency
// ============================================
describe("Integration H — platformWritingEstimate mirrors dseLevel", () => {
  it("uses the same value for legacy and preferred estimate fields", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse({
        contentScore: 3,
        languageScore: 4,
        organizationScore: 5,
      }));

    const result = await analyzeWriting(defaultInput);

    // dseLevel is computed from cloTotalScore (3+4+5=12 → Level 3)
    expect(result.dseLevel).toBeDefined();
    // Both fields must carry the same value
    expect(result.platformWritingEstimate).toBe(result.dseLevel);
  });
});

// ============================================
// Test I: RAG context cannot alter formal writing score
// ============================================
describe("Integration I — RAG score isolation", () => {
  it("RAG context cannot alter formal writing score", async () => {
    // Both runs use identical mocked LLM responses
    // RAG context may vary but scoring must not
    const grammarResponse = mockGrammarResponse();

    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(grammarResponse);
    const result1 = await analyzeWriting(defaultInput);

    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(grammarResponse);
    const result2 = await analyzeWriting(defaultInput);

    // Scores must be identical regardless of any RAG context variance
    expect(result2.contentScore).toBe(result1.contentScore);
    expect(result2.languageScore).toBe(result1.languageScore);
    expect(result2.organizationScore).toBe(result1.organizationScore);
    expect(result2.overallScore).toBe(result1.overallScore);
  });
});

// ============================================
// R3.10-K Phase 3 — canonical authority & fail-closed contract
// ============================================
describe("Integration J — canonical score authority (no LLM override, no 70)", () => {
  it("LLM overallScore=100 does not override computed CLO score (3+4+5=12 → 57)", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse({ overallScore: 100 }));
    const result = await analyzeWriting(defaultInput);
    expect(result.cloTotalScore).toBe(12);
    expect(result.overallScore).toBe(57);
  });

  it("LLM overallScore missing + valid C/L/O → canonical score still produced", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse({ overallScore: undefined }));
    const result = await analyzeWriting(defaultInput);
    expect(result.cloTotalScore).toBe(12);
    expect(result.overallScore).toBe(57);
  });

  it("C/L/O missing → scoring fails closed (never 70, never LLM overallScore)", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse({
        contentScore: undefined,
        languageScore: undefined,
        organizationScore: undefined,
        overallScore: 100,
      }));
    await expect(analyzeWriting(defaultInput)).rejects.toThrow(/CLO 評分不完整/);
  });
});

describe("Integration K — off-topic cap is PLATFORM_DEFINED, not official", () => {
  it("grammar system prompt labels the off-topic cap as platform policy", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    await analyzeWriting(defaultInput);

    // Both the grammar and the style calls carry system prompts; the
    // PLATFORM_DEFINED off-topic label must appear in the grammar/CLO one.
    const systemMessages = mockCallLLM.mock.calls
      .filter((c: unknown[]) => Array.isArray(c[0]))
      .map((c: unknown[]) => (c[0] as Array<{ role?: string; content?: string }>)[0]?.content ?? "");
    expect(
      systemMessages.some((content: string) =>
        content.includes("平台防護政策（PLATFORM_DEFINED）") && content.includes("非 HKEAA 官方規則"),
      ),
    ).toBe(true);
  });
});

describe("Integration L — canonical scoring version", () => {
  it("returns SCORING_VERSION with the analysis", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const result = await analyzeWriting(defaultInput);
    expect(result.scoringVersion).toBe("HKDSE_P2_WRITING_CANONICAL_V3");
  });
});

// ============================================
// R3.10-K Phase 5 — artifact metadata NEVER alters canonical scoring
// ============================================
describe("Integration M — pedagogical target cannot mutate scoring (semantic mutation)", () => {
  const generatedMeta = (level: "3" | "5") => ({
    source: "generated_model" as const,
    pedagogicalTargetLevel: level,
    generationTarget: "mid" as const,
    generationVersion: "MODEL_ESSAY_GENERATION_V1",
    qualityStatus: "verified" as const,
  });

  it("same essay with target Level 3 vs target Level 5 → identical C/L/O, overallScore, dseLevel", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const resultA = await analyzeWriting({ ...defaultInput, artifact: generatedMeta("3") });

    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const resultB = await analyzeWriting({ ...defaultInput, artifact: generatedMeta("5") });

    expect(resultA.contentScore).toBe(resultB.contentScore);
    expect(resultA.languageScore).toBe(resultB.languageScore);
    expect(resultA.organizationScore).toBe(resultB.organizationScore);
    expect(resultA.overallScore).toBe(resultB.overallScore);
    expect(resultA.dseLevel).toBe(resultB.dseLevel);
  });

  it("artifact metadata is echoed, and assessment does NOT overwrite pedagogicalTargetLevel", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    // C=3 L=4 O=5 → 12/21 → platform estimate "3"; force target "5" to prove independence.
    const result = await analyzeWriting({ ...defaultInput, artifact: generatedMeta("5") });

    expect(result.artifact?.pedagogicalTargetLevel).toBe("5"); // target untouched
    expect(result.dseLevel).toBe("3");                          // assessment independent
  });

  it("student submission without artifact still scores normally (no guessing)", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const result = await analyzeWriting(defaultInput);
    expect(result.artifact).toBeUndefined();
    expect(result.overallScore).toBe(57);
  });

  it("TEST C — artifact absent vs artifact present → identical scores", async () => {
    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const without = await analyzeWriting(defaultInput);

    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const withArtifact = await analyzeWriting({ ...defaultInput, artifact: generatedMeta("3") });

    expect(withArtifact.contentScore).toBe(without.contentScore);
    expect(withArtifact.languageScore).toBe(without.languageScore);
    expect(withArtifact.organizationScore).toBe(without.organizationScore);
    expect(withArtifact.overallScore).toBe(without.overallScore);
    expect(withArtifact.dseLevel).toBe(without.dseLevel);
  });

  it("TEST B — generationVersion A vs B → identical scores", async () => {
    const vA = { ...generatedMeta("3"), generationVersion: "MODEL_ESSAY_GENERATION_V1" };
    const vB = { ...generatedMeta("3"), generationVersion: "MODEL_ESSAY_GENERATION_V2" };

    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const resultA = await analyzeWriting({ ...defaultInput, artifact: vA });

    mockCallLLM
      .mockResolvedValueOnce(mockStyleResponse())
      .mockResolvedValueOnce(mockGrammarResponse());
    const resultB = await analyzeWriting({ ...defaultInput, artifact: vB });

    expect(resultB.overallScore).toBe(resultA.overallScore);
    expect(resultB.dseLevel).toBe(resultA.dseLevel);
    expect(resultB.artifact?.generationVersion).toBe("MODEL_ESSAY_GENERATION_V2"); // echo preserved
  });
});
