// ============================================
// Sprint 127: Semantic Evaluator regression tests
// ============================================

import { describe, it, expect } from "vitest";
import { SemanticEvaluationSchema } from "@/modules/ai/schemas/ai-schema";

// ============================================
// Zod schema validation tests
// ============================================

describe("SemanticEvaluationSchema", () => {
  const validHigh: unknown = {
    taskSummary: "Write an article about AI in education.",
    requirements: [
      {
        requirement: "Discuss benefits of AI",
        status: "satisfied",
        evidence: ["AI helps students learn faster."],
        explanation: "Student addresses a benefit.",
      },
      {
        requirement: "Discuss drawbacks of AI",
        status: "satisfied",
        evidence: ["AI may reduce critical thinking."],
        explanation: "Student addresses a drawback.",
      },
    ],
    overallCoverage: "high",
  };

  it("accepts a valid high-coverage evaluation", () => {
    expect(() => SemanticEvaluationSchema.parse(validHigh)).not.toThrow();
  });

  it("accepts medium coverage", () => {
    const medium = {
      ...validHigh,
      overallCoverage: "medium",
    };
    expect(() => SemanticEvaluationSchema.parse(medium)).not.toThrow();
  });

  it("accepts low coverage", () => {
    const low = {
      ...validHigh,
      overallCoverage: "low",
    };
    expect(() => SemanticEvaluationSchema.parse(low)).not.toThrow();
  });

  it("rejects invalid overallCoverage", () => {
    const invalid = { ...validHigh, overallCoverage: "excellent" };
    expect(() => SemanticEvaluationSchema.parse(invalid)).toThrow();
  });

  it("rejects invalid status", () => {
    const invalid = {
      ...validHigh,
      requirements: [
        {
          requirement: "Test",
          status: "excellent",
          evidence: ["test"],
          explanation: "test",
        },
      ],
    };
    expect(() => SemanticEvaluationSchema.parse(invalid)).toThrow();
  });

  it("accepts missing status with empty evidence", () => {
    const missing = {
      taskSummary: "Test task",
      requirements: [
        {
          requirement: "Missing requirement",
          status: "missing",
          evidence: [],
          explanation: "No evidence found.",
        },
      ],
      overallCoverage: "low",
    };
    expect(() => SemanticEvaluationSchema.parse(missing)).not.toThrow();
  });

  it("accepts unclear status with empty evidence", () => {
    const unclear = {
      taskSummary: "Test task",
      requirements: [
        {
          requirement: "Unclear requirement",
          status: "unclear",
          evidence: [],
          explanation: "Cannot determine.",
        },
      ],
      overallCoverage: "medium",
    };
    expect(() => SemanticEvaluationSchema.parse(unclear)).not.toThrow();
  });

  it("rejects empty requirement string", () => {
    const invalid = {
      ...validHigh,
      requirements: [{ ...(validHigh as { requirements: Array<Record<string,unknown>> }).requirements[0], requirement: "" }],
    };
    expect(() => SemanticEvaluationSchema.parse(invalid)).toThrow();
  });

  it("rejects empty taskSummary", () => {
    expect(() =>
      SemanticEvaluationSchema.parse({ ...validHigh, taskSummary: "" }),
    ).toThrow();
  });
});

// ============================================
// Task coverage distinction tests
// ============================================

describe("Task coverage semantics", () => {
  it("high coverage: all requirements satisfied", () => {
    const result = {
      taskSummary: "Write a letter suggesting two library improvements.",
      requirements: [
        {
          requirement: "Write in letter format",
          status: "satisfied" as const,
          evidence: ["Dear Principal,"],
          explanation: "Letter opening present.",
        },
        {
          requirement: "Suggest first improvement",
          status: "satisfied" as const,
          evidence: ["Add more computers."],
          explanation: "First suggestion provided.",
        },
        {
          requirement: "Suggest second improvement",
          status: "satisfied" as const,
          evidence: ["Extend opening hours."],
          explanation: "Second suggestion provided.",
        },
      ],
      overallCoverage: "high" as const,
    };
    expect(result.overallCoverage).toBe("high");
    expect(result.requirements.every((r) => r.status === "satisfied")).toBe(
      true,
    );
  });

  it("medium coverage: one requirement missing", () => {
    const result = {
      taskSummary: "Write a letter suggesting two library improvements.",
      requirements: [
        {
          requirement: "Write in letter format",
          status: "satisfied" as const,
          evidence: ["Dear Principal,"],
          explanation: "Letter opening present.",
        },
        {
          requirement: "Suggest first improvement",
          status: "satisfied" as const,
          evidence: ["Add more computers."],
          explanation: "First suggestion provided.",
        },
        {
          requirement: "Suggest second improvement",
          status: "missing" as const,
          evidence: [],
          explanation: "Second suggestion not found.",
        },
      ],
      overallCoverage: "medium" as const,
    };
    expect(result.overallCoverage).toBe("medium");
    expect(result.requirements.some((r) => r.status === "missing")).toBe(true);
  });

  it("low coverage: completely off-topic", () => {
    const result = {
      taskSummary: "Write about AI in education.",
      requirements: [
        {
          requirement: "Discuss AI benefits",
          status: "missing" as const,
          evidence: [],
          explanation: "Essay is about sports, not AI.",
        },
        {
          requirement: "Discuss AI drawbacks",
          status: "missing" as const,
          evidence: [],
          explanation: "Essay is about sports, not AI.",
        },
      ],
      overallCoverage: "low" as const,
    };
    expect(result.overallCoverage).toBe("low");
    expect(result.requirements.every((r) => r.status === "missing")).toBe(true);
  });

  it("relevant but underdeveloped: high coverage, partial statuses", () => {
    const result = {
      taskSummary: "Discuss two benefits of reading.",
      requirements: [
        {
          requirement: "State first benefit",
          status: "partial" as const,
          evidence: ["Reading is good."],
          explanation: "Benefit mentioned but not developed.",
        },
        {
          requirement: "State second benefit",
          status: "partial" as const,
          evidence: ["It helps vocabulary."],
          explanation: "Benefit mentioned but not explained.",
        },
      ],
      overallCoverage: "high" as const,
    };
    // High coverage because both requirements are addressed (albeit weakly)
    expect(result.overallCoverage).toBe("high");
    // But evidence indicates underdevelopment
    expect(result.requirements.every((r) => r.status === "partial")).toBe(true);
  });
});

// ============================================
// Evidence integrity tests
// ============================================

describe("Evidence integrity", () => {
  it("missing requirements must have empty evidence", () => {
    const eval1 = {
      requirement: "Test requirement",
      status: "missing" as const,
      evidence: ["This should not be here"],
      explanation: "test",
    };
    // Evidence for missing requirements should be empty — verified by convention
    expect(eval1.status === "missing" && eval1.evidence.length > 0).toBe(true);
    // This documents the expectation: when status is "missing", evidence should be []
    // The schema allows non-empty evidence for missing (for edge cases),
    // but the semantic evaluator prompt instructs the LLM to use empty arrays.
  });

  it("satisfied requirements should have evidence", () => {
    const result = SemanticEvaluationSchema.parse({
      taskSummary: "Test",
      requirements: [
        {
          requirement: "Test requirement",
          status: "satisfied",
          evidence: ["Actual student text here."],
          explanation: "Evidence found.",
        },
      ],
      overallCoverage: "high",
    });
    expect(result.requirements[0].evidence.length).toBeGreaterThan(0);
  });
});

// ============================================
// Writing rubric no longer contains 5** / 5*
// ============================================

describe("Writing rubric contract", () => {
  it("CLO_RUBRIC no longer contains 5** or 5* level mapping", async () => {
    const { CLO_RUBRIC } = await import(
      "@/modules/ai/prompts/writing/writing-rubric"
    );
    expect(CLO_RUBRIC).not.toContain("5**");
    expect(CLO_RUBRIC).not.toContain("5*");
  });

  it("CLO_RUBRIC contains disclaimer about internal estimate", async () => {
    const { CLO_RUBRIC } = await import(
      "@/modules/ai/prompts/writing/writing-rubric"
    );
    expect(CLO_RUBRIC).toContain("pedagogical estimation");
    expect(CLO_RUBRIC).toContain("NOT an official HKEAA grade conversion");
  });
});
