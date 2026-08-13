// ============================================
// R3.10-K Phase 3 — analyze-writing request contract
// The UI sends gradeLevel/difficulty; they must never be silently
// stripped — gradeLevel maps to studentLevel at the boundary.
// ============================================

import { describe, expect, it } from "vitest";
import {
  analyzeWritingSchema,
  resolveWritingStudentLevel,
} from "../schemas/ai-request.schema";

describe("analyzeWritingSchema — UI field compatibility", () => {
  it("accepts a minimal valid request", () => {
    const result = analyzeWritingSchema.safeParse({
      title: "T",
      studentDraft: "Some draft text.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts the UI's gradeLevel and difficulty fields (not stripped)", () => {
    const result = analyzeWritingSchema.safeParse({
      title: "T",
      studentDraft: "Some draft text.",
      gradeLevel: "S5",
      difficulty: "core",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gradeLevel).toBe("S5");
      expect(result.data.difficulty).toBe("core");
    }
  });

  it("rejects an empty title or draft", () => {
    expect(analyzeWritingSchema.safeParse({ title: "", studentDraft: "x" }).success).toBe(false);
    expect(analyzeWritingSchema.safeParse({ title: "T", studentDraft: "" }).success).toBe(false);
  });
});

describe("resolveWritingStudentLevel — boundary mapping", () => {
  it("prefers canonical studentLevel over gradeLevel", () => {
    expect(resolveWritingStudentLevel({ studentLevel: "S4", gradeLevel: "S5" })).toBe("S4");
  });

  it("maps the UI's gradeLevel when studentLevel is absent", () => {
    expect(resolveWritingStudentLevel({ gradeLevel: "S5" })).toBe("S5");
  });

  it("returns undefined when neither is provided", () => {
    expect(resolveWritingStudentLevel({})).toBeUndefined();
  });

  it("preserves arbitrary string levels (validation of S1-S6 is out of scope)", () => {
    expect(resolveWritingStudentLevel({ gradeLevel: "S2" })).toBe("S2");
  });
});
