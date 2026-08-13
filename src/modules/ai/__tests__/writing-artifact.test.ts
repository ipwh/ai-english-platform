// ============================================
// R3.10-K Phase 5 — Writing Artifact Identity Contract
// Invariants: deterministic target mapping, server-built metadata,
// no guessing of unknown historical artifacts, Zod contract.
// ============================================

import { describe, expect, it } from "vitest";
import {
  WritingArtifactMetadataSchema,
  buildGeneratedModelMetadata,
  generationTargetToPedagogicalLevel,
  MODEL_ESSAY_GENERATION_VERSION,
  GenerationTargetSchema,
} from "../core/writing-artifact";

describe("Invariant G — generation target mapping is deterministic", () => {
  it("mid → 3, high → 5, low → 2 (PLATFORM_DEFINED ladder)", () => {
    expect(generationTargetToPedagogicalLevel("mid")).toBe("3");
    expect(generationTargetToPedagogicalLevel("high")).toBe("5");
    expect(generationTargetToPedagogicalLevel("low")).toBe("2");
  });

  it("same target always maps to the same level", () => {
    for (let i = 0; i < 20; i++) {
      expect(generationTargetToPedagogicalLevel("mid")).toBe("3");
    }
  });
});

describe("Invariant H — LLM cannot override generation target metadata", () => {
  it("metadata is built only from server-determined target (no LLM input)", () => {
    // buildGeneratedModelMetadata takes ONLY the server-chosen target;
    // there is no parameter by which an LLM could inject a level.
    const meta = buildGeneratedModelMetadata({ generationTarget: "mid" });
    expect(meta.pedagogicalTargetLevel).toBe("3");
    expect(meta.source).toBe("generated_model");
    expect(meta.generationVersion).toBe(MODEL_ESSAY_GENERATION_VERSION);
  });

  it("generationVersion is explicit and independent from scoring version", () => {
    expect(MODEL_ESSAY_GENERATION_VERSION).toBe("MODEL_ESSAY_GENERATION_V1");
    // Independent of the canonical scoring version string.
    expect(MODEL_ESSAY_GENERATION_VERSION).not.toBe("HKDSE_P2_WRITING_CANONICAL_V1");
  });
});

describe("WritingArtifactMetadataSchema", () => {
  it("accepts valid generated-model metadata", () => {
    const result = WritingArtifactMetadataSchema.safeParse(
      buildGeneratedModelMetadata({ generationTarget: "mid" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts source-only metadata (unknown provenance is represented by ABSENCE, never guessed)", () => {
    const result = WritingArtifactMetadataSchema.safeParse({ source: "student_submission" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pedagogicalTargetLevel).toBeUndefined();
      expect(result.data.generationTarget).toBeUndefined();
    }
  });

  it("rejects invalid source / target / quality values", () => {
    expect(WritingArtifactMetadataSchema.safeParse({ source: "mystery" }).success).toBe(false);
    expect(WritingArtifactMetadataSchema.safeParse({ source: "generated_model", pedagogicalTargetLevel: "9" }).success).toBe(false);
    expect(WritingArtifactMetadataSchema.safeParse({ source: "generated_model", generationTarget: "medium" }).success).toBe(false);
    expect(WritingArtifactMetadataSchema.safeParse({ source: "generated_model", qualityStatus: "passed" }).success).toBe(false);
  });

  it("generation target enum is exactly low|mid|high", () => {
    expect(GenerationTargetSchema.safeParse("low").success).toBe(true);
    expect(GenerationTargetSchema.safeParse("mid").success).toBe(true);
    expect(GenerationTargetSchema.safeParse("high").success).toBe(true);
    expect(GenerationTargetSchema.safeParse("medium").success).toBe(false);
  });
});

describe("Invariant F — unknown historical artifacts are never guessed", () => {
  it("no helper fabricates source/target from absence", () => {
    // The contract is data-passing only: parsing an empty/absent metadata
    // yields undefined fields, not generated_model/Level 3.
    const parsed = WritingArtifactMetadataSchema.safeParse(undefined);
    expect(parsed.success).toBe(false); // schema requires an object when present
  });
});
