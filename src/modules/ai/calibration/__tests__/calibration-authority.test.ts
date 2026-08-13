// ============================================
// R3.10-F: Calibration Authority Isolation Tests
//
// Covers Phase 9 (security / authority audit):
//
//   authoritative calibration data
//           ↓
//   evaluation only
//           ↓
//   NO runtime studentMastery
//   NO PracticeAnswer
//   NO Mistake
//   NO WeeklySnapshot
//   NO student accuracy
//   NO adaptive learning state
//
// Calibration fixtures are evaluation infrastructure ONLY and must
// never become a runtime scoring authority for student submissions.
// ============================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..", "..", "..");
const FIXTURES_DIR = join(__dirname, "..", "fixtures", "hkeaa");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("Calibration authority — runtime isolation", () => {
  const routeFiles = existsSync(join(PROJECT_ROOT, "src", "app", "api"))
    ? walk(join(PROJECT_ROOT, "src", "app", "api")).filter(f => f.endsWith(".ts"))
    : [];

  it("no API route imports the calibration module", () => {
    for (const file of routeFiles) {
      const content = readFileSync(file, "utf-8");
      expect(content, `Route ${file} must not import calibration`).not.toMatch(
        /from\s+["']@\/modules\/ai\/calibration/,
      );
    }
  });

  const runtimeModulePatterns = [
    "src/modules/exercise",
    "src/modules/student",
    "src/modules/learning",
    "src/modules/adaptive-tutor",
    "src/modules/assessment",
  ];

  it("no runtime service module imports the calibration module", () => {
    const violations: string[] = [];
    for (const pattern of runtimeModulePatterns) {
      const dir = join(PROJECT_ROOT, pattern);
      if (!existsSync(dir)) continue;
      for (const file of walk(dir).filter(f => f.endsWith(".ts") && !f.includes("__tests__"))) {
        const content = readFileSync(file, "utf-8");
        if (content.includes("modules/ai/calibration")) {
          violations.push(file);
        }
      }
    }
    expect(violations, `runtime modules must not import calibration:\n${violations.join("\n")}`)
      .toEqual([]);
  });

  it("no fixture contains runtime state keys", () => {
    const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith(".json"));
    const forbidden = ["studentMastery", "PracticeAnswer", "Mistake", "WeeklySnapshot", "accuracy"];
    for (const file of files) {
      const raw = readFileSync(join(FIXTURES_DIR, file), "utf-8");
      for (const key of forbidden) {
        expect(raw, `${file} contains forbidden runtime key ${key}`).not.toContain(`"${key}"`);
      }
    }
  });

  it("fixture files carry no scoring-authority markers for student submissions", () => {
    const files = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("hkeaa-p"));
    for (const file of files) {
      const raw = readFileSync(join(FIXTURES_DIR, file), "utf-8");
      const f = JSON.parse(raw);
      // No fixture may declare itself an authority for live scoring
      expect(f.scoringAuthority).toBeUndefined();
      expect(f.runtimeScoreMapping).toBeUndefined();
    }
  });

  it("calibration fixtures are never referenced by practice scoring code", () => {
    const practiceEvidence = join(
      PROJECT_ROOT,
      "src",
      "modules",
      "exercise",
      "services",
      "practice-evidence-service.ts",
    );
    expect(existsSync(practiceEvidence)).toBe(true);
    const content = readFileSync(practiceEvidence, "utf-8");
    expect(content).not.toContain("calibration");
  });

  it("the authority chain of R3.10-D is untouched by calibration code", () => {
    // The canonical authority decision point must not mention calibration.
    const evidence = readFileSync(
      join(PROJECT_ROOT, "src", "modules", "exercise", "services", "practice-evidence-service.ts"),
      "utf-8",
    );
    expect(evidence).toContain("unverified-key-authority");
  });
});
