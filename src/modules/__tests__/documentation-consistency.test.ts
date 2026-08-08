// ============================================
// Sprint 131: Documentation Consistency Tests
// Ensures all project documentation avoids prohibited claims.
// Run: npx vitest run src/modules/__tests__/documentation-consistency.test.ts
// ============================================

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = join(__dirname, "..", "..", "..");

const DOCUMENTATION_FILES = [
  "README.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "AGENTS.md",
  "docs/ARCHITECTURE.md",
  "docs/MAINTENANCE.md",
  "docs/DOMAIN_AUDIT.md",
  "docs/DEPLOYMENT.md",
  "docs/RUNBOOK.md",
  "docs/SMOKE-TEST.md",
];

function readExistingDocs(): Array<{ path: string; content: string }> {
  return DOCUMENTATION_FILES
    .filter((file) => existsSync(join(PROJECT_ROOT, file)))
    .map((file) => ({
      path: file,
      content: readFileSync(join(PROJECT_ROOT, file), "utf-8"),
    }));
}

function readme(): string {
  return readFileSync(join(PROJECT_ROOT, "README.md"), "utf-8");
}

// ============================================
// Cross-document prohibited claims
// ============================================
describe("Cross-document prohibited claims", () => {
  it("no document claims official HKEAA equivalence (affirmative)", () => {
    for (const doc of readExistingDocs()) {
      // Allow negated forms (NOT official, 並非...官方) but reject affirmative claims
      // Strip lines that contain negation before checking
      const lines = doc.content.split("\n")
        .filter(l => !l.match(/NOT official|並非.*官方|not.*official.*HKEAA/i));
      const filtered = lines.join("\n");
      expect(filtered, `Violation in ${doc.path}`)
        .not.toMatch(/official HKEAA (grade|score|equivalent|評分|等級)/i);
    }
  });

  it("no document claims RAG guarantees scoring accuracy", () => {
    for (const doc of readExistingDocs()) {
      expect(doc.content, `Violation in ${doc.path}`)
        .not.toMatch(/RAG.{0,200}(guarantee|ensure).{0,200}(accur|score)/is);
    }
  });

  it("no document claims unverified DSE Level mapping", () => {
    for (const doc of readExistingDocs()) {
      // Allow "NOT official HKEAA" disclaimers, but not affirmative DSE Level claims
      expect(doc.content, `Violation in ${doc.path}`)
        .not.toMatch(/DSE Level \d\s*(mapping|prediction|equivalent|對照|guaranteed)/i);
    }
  });

  it("no document claims 100% module coverage without evidence", () => {
    for (const doc of readExistingDocs()) {
      // CHANGELOG.md contains historical entries — skip it for this check
      if (doc.path === "CHANGELOG.md") continue;
      expect(doc.content, `Violation in ${doc.path}`)
        .not.toMatch(/100%.*(module|coverage|覆蓋)/i);
    }
  });

  it("no document claims guaranteed exam prediction", () => {
    for (const doc of readExistingDocs()) {
      expect(doc.content, `Violation in ${doc.path}`)
        .not.toMatch(/guaranteed.*(exam|DSE|HKDSE|score|grade|prediction)/i);
    }
  });
});

// ============================================
// README-specific claims
// ============================================
describe("README — prohibited claims", () => {
  it("does not claim official HKEAA equivalence", () => {
    expect(readme()).not.toMatch(/official HKEAA (grade|score|equivalent|評分|等級)/i);
  });

  it("does not claim RAG ensures scoring accuracy", () => {
    expect(readme()).not.toMatch(/RAG.*(ensure|guarantee|保證).*(accuracy|準確|評分)/i);
  });

  it("describes writing scores as platform estimates", () => {
    expect(readme()).toMatch(/平台.*(練習|診斷).*(估算|estimate)/i);
    expect(readme()).toMatch(/並非.*(HKEAA|官方).*(評級|評分|grade)/i);
  });

  it("does not claim Integrated Skills uses 'HKEAA 官方三維評分'", () => {
    expect(readme()).not.toMatch(/HKEAA 官方三維評分/);
  });

  it("Integrated Skills section has disclaimer", () => {
    const idx = readme().indexOf("Integrated Skills");
    if (idx > -1) {
      expect(readme().slice(idx, idx + 800)).toMatch(/並非.*HKEAA.*官方/i);
    }
  });
});

// ============================================
// README structural consistency
// ============================================
describe("README — structural consistency", () => {
  it("contains the disclaimer about platform scores not being official", () => {
    expect(readme()).toContain("並非 HKEAA 官方評級");
  });

  it("contains self-study positioning", () => {
    expect(readme()).toMatch(/自學|self.study|formative/i);
  });

  it("contains the writing evaluation section", () => {
    expect(readme()).toContain("Writing Evaluation");
  });
});

// ============================================
// CLAUDE.md consistency
// ============================================
describe("CLAUDE.md consistency", () => {
  it("does not claim Production Ready with unverifiable score", () => {
    if (!existsSync(join(PROJECT_ROOT, "CLAUDE.md"))) return;
    const text = readFileSync(join(PROJECT_ROOT, "CLAUDE.md"), "utf-8");
    expect(text).not.toMatch(/9\.8\/10.*Production Ready/i);
    expect(text).not.toMatch(/Production Ready.*9\.8\/10/i);
  });
});

// ============================================
// ARCHITECTURE.md consistency
// ============================================
describe("ARCHITECTURE.md consistency", () => {
  it("does not claim 100% coverage without evidence", () => {
    if (!existsSync(join(PROJECT_ROOT, "docs/ARCHITECTURE.md"))) return;
    const text = readFileSync(join(PROJECT_ROOT, "docs/ARCHITECTURE.md"), "utf-8");
    expect(text).not.toMatch(/100% coverage/);
  });
});
