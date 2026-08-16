// ============================================
// R3.10-K Phase 7 — TEST-CAL-013: RAG Contamination Defense
//
// Human-marker scored scripts / calibration references must NEVER be
// RAG-indexed: retrieval into scoring prompts would be data leakage
// (the model being evaluated would see the answers).
// ============================================

import { describe, expect, it } from "vitest";
import {
  shouldExcludeMaterialFromRAG,
  parseMaterialTags,
} from "../rag-exclusion";

describe("TEST-CAL-013 — RAG exclusion guard", () => {
  it("excludes human-marker scored-scripts sources by title", () => {
    const r = shouldExcludeMaterialFromRAG({
      title: "2018 DSE English Paper 2 5** scripts 真跡",
    });
    expect(r.excluded).toBe(true);
    expect(r.reason).toContain("scored-scripts");
  });

  it("excludes the calibration source directory by path", () => {
    const r = shouldExcludeMaterialFromRAG({
      sourcePath: "materials/_hkeaa_scored_scripts/2018 scripts.pdf",
    });
    expect(r.excluded).toBe(true);
  });

  it("excludes explicit calibration-reference / retrieval-excluded tags", () => {
    expect(shouldExcludeMaterialFromRAG({ tags: ["calibration-reference"] }).excluded).toBe(true);
    expect(shouldExcludeMaterialFromRAG({ tags: ["retrieval-excluded"] }).excluded).toBe(true);
  });

  it("allows ordinary learning materials", () => {
    const r = shouldExcludeMaterialFromRAG({
      title: "Grammar Workbook Unit 5",
      tags: ["grammar", "S4"],
      sourcePath: "materials/workbook-5.pdf",
    });
    expect(r.excluded).toBe(false);
    expect(r.reason).toBeNull();
  });

  it("parseMaterialTags never throws on malformed tag JSON", () => {
    expect(parseMaterialTags('["grammar", "writing"]')).toEqual(["grammar", "writing"]);
    expect(parseMaterialTags("not json")).toEqual(["not json"]);
    expect(parseMaterialTags(null)).toEqual([]);
  });
});
