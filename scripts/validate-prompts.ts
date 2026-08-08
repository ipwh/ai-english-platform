/**
 * Prompt 驗證腳本 — validate-prompts.ts
 *
 * Validates prompt text for architecture contract compliance.
 * Uses STATIC SOURCE CONTRACT CHECKS — reads source files and
 * verifies that prompt text (not just comments) contains required rules.
 *
 * LIMITATION: This is a static source-text checker. It does NOT parse
 * or execute runtime-generated prompts. It cannot distinguish prompt
 * strings from code comments. A malicious edit could add a comment
 * with the required text without including it in the actual LLM prompt.
 *
 * Runtime contracts (score normalization, evidence filtering, fail-open,
 * RAG score isolation) are verified separately by unit/integration tests.
 * This validator covers prompt-level and structural contracts only.
 *
 * Usage: npx tsx scripts/validate-prompts.ts
 *
 * Exit code:
 *   0 — All prompt contracts verified
 *   1 — One or more contracts violated
 *
 * Last verified: 2026-08-08
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ============================================
// Prompt sources to validate
// ============================================
export const PROMPT_SOURCES: Array<{ name: string; file: string }> = [
  {
    name: "analyze-writing (grammar/CLO prompt)",
    file: resolve(__dirname, "..", "src", "modules", "ai", "usecases", "analyze-writing.ts"),
  },
  {
    name: "writing-rubric (CLO_RUBRIC)",
    file: resolve(__dirname, "..", "src", "modules", "ai", "prompts", "writing", "writing-rubric.ts"),
  },
  {
    name: "semantic-evaluator",
    file: resolve(__dirname, "..", "src", "modules", "ai", "usecases", "semantic-evaluator.ts"),
  },
];

// ============================================
// Prompt-level contract checks (STATIC SOURCE CONTRACT CHECKS)
//
// These verify that the prompt TEXT (the actual strings sent to the LLM)
// contains required architecture rules. Each check looks for the presence
// of required language in the source file.
//
// LIMITATION: These are text-inclusion checks. A malicious edit could add
// a comment with the required text without actually including it in the
// prompt string. Runtime tests provide defense-in-depth against that.
// ============================================
type ContractCheck = {
  id: string;
  category: "prompt-level" | "source-structural";
  description: string;
  /** What this check looks for in the source text */
  requiredText: string[];
  /** Optional: text that must NOT appear */
  prohibitedText?: string[];
  /** Which source names this check applies to */
  appliesTo: string[];
  /** Check function */
  check: (sourceText: string, sourceName: string) => string[];
};

function makeTextCheck(
  id: string,
  category: "prompt-level" | "source-structural",
  description: string,
  requiredText: string[],
  appliesTo: string[],
  prohibitedText?: string[],
): ContractCheck {
  return {
    id,
    category,
    description,
    requiredText,
    prohibitedText,
    appliesTo,
    check: (text, name) => {
      const violations: string[] = [];
      if (!appliesTo.some(a => name.includes(a))) return violations;
      for (const req of requiredText) {
        if (!text.includes(req)) {
          violations.push(`[${id}] Missing required text: "${req}"`);
        }
      }
      if (prohibitedText) {
        for (const pro of prohibitedText) {
          if (text.includes(pro)) {
            violations.push(`[${id}] Found prohibited text: "${pro}"`);
          }
        }
      }
      return violations;
    },
  };
}

/**
 * Prompt-level contracts (7 checks):
 * Rules that must appear in the actual prompt text sent to the LLM.
 */
export const CONTRACT_CHECKS: ContractCheck[] = [
  makeTextCheck(
    "untrusted-data",
    "prompt-level",
    "Student essay is declared as untrusted data",
    ["不受信任的數據"],
    ["analyze-writing"],
  ),
  makeTextCheck(
    "semantic-evidence-only",
    "prompt-level",
    "Semantic evaluator is declared evidence-only",
    ["EVIDENCE only"],
    ["semantic-evaluator"],
  ),
  makeTextCheck(
    "clo-sole-authority",
    "prompt-level",
    "CLO evaluator is sole score authority — LLM overallScore is overridden by computed CLO",
    ["重新計算"],
    ["analyze-writing"],
  ),
  makeTextCheck(
    "rag-reference-only",
    "prompt-level",
    "RAG context is declared as reference-only",
    ["CONTEXTUAL REFERENCE ONLY"],
    ["analyze-writing"],
  ),
  makeTextCheck(
    "platform-estimate-disclaimer",
    "prompt-level",
    "Platform estimate is declared as not an official HKEAA grade",
    ["並非 HKEAA 官方"],
    ["analyze-writing"],
  ),
  makeTextCheck(
    "teaching-heuristics-not-mandatory",
    "prompt-level",
    "PEEL/counterargument are declared as teaching heuristics, not mandatory criteria",
    ["教學啟發式", "不可視為"],
    ["analyze-writing"],
  ),
  makeTextCheck(
    "prompt-injection-defense",
    "prompt-level",
    "Student essay is marked as untrusted data (prompt injection defense)",
    ["不受信任的數據"],
    ["analyze-writing"],
  ),
];

/**
 * Source-structural checks (3 checks):
 * Verify code structure patterns, not prompt text content.
 * These are supplemented by runtime integration tests.
 */
export const STRUCTURAL_CHECKS: ContractCheck[] = [
  makeTextCheck(
    "rubric-single-source",
    "source-structural",
    "CLO_RUBRIC and CLO_RUBRIC_ZH are both exported from rubric file",
    ["CLO_RUBRIC", "CLO_RUBRIC_ZH"],
    ["writing-rubric"],
  ),
  makeTextCheck(
    "fail-open-pattern",
    "source-structural",
    "Promise.allSettled + semanticFailed flag provides fail-open behavior",
    ["Promise.allSettled", "semanticFailed"],
    ["analyze-writing"],
  ),
  makeTextCheck(
    "deterministic-overall-score-code",
    "source-structural",
    "overallScore is computed from CLO sub-scores, not LLM arbitrary value",
    ["overallScore", "重新計算"],
    ["analyze-writing"],
  ),
];

const ALL_CHECKS = [...CONTRACT_CHECKS, ...STRUCTURAL_CHECKS];

// ============================================
// Core validation logic (exported for testing)
// ============================================
export interface ValidationResult {
  totalSources: number;
  totalChecks: number;
  passed: number;
  failed: number;
  failures: string[];
}

/**
 * Evaluate all contract checks against a single source string.
 * Useful for mutation testing.
 */
export function evaluatePromptContracts(source: string, sourceName: string): ValidationResult {
  const failures: string[] = [];
  let passed = 0;

  for (const check of ALL_CHECKS) {
    if (!check.appliesTo.some(a => sourceName.includes(a))) continue;
    const violations = check.check(source, sourceName);
    if (violations.length === 0) {
      passed++;
    } else {
      failures.push(...violations);
    }
  }

  const totalChecks = ALL_CHECKS.filter(c => c.appliesTo.some(a => sourceName.includes(a))).length;

  return {
    totalSources: 1,
    totalChecks,
    passed,
    failed: failures.length,
    failures,
  };
}

export async function runPromptValidation(): Promise<ValidationResult> {
  const allFailures: string[] = [];
  let totalChecks = 0;
  let totalPassed = 0;

  for (const source of PROMPT_SOURCES) {
    let sourceText: string;
    try {
      sourceText = readFileSync(source.file, "utf-8");
    } catch {
      allFailures.push(`Cannot read source: ${source.name} (${source.file})`);
      continue;
    }

    const result = evaluatePromptContracts(sourceText, source.name);
    totalChecks += result.totalChecks;
    totalPassed += result.passed;
    allFailures.push(...result.failures);
  }

  return {
    totalSources: PROMPT_SOURCES.length,
    totalChecks,
    passed: totalPassed,
    failed: allFailures.length,
    failures: allFailures,
  };
}

// ============================================
// CLI
// ============================================
async function main() {
  console.log("🔍 AI Prompt Validation — Architecture Contract Checks\n");
  console.log(`Prompt sources: ${PROMPT_SOURCES.length}`);
  console.log(`Prompt-level checks: ${CONTRACT_CHECKS.length}`);
  console.log(`Source-structural checks: ${STRUCTURAL_CHECKS.length}`);
  console.log(`Total checks: ${ALL_CHECKS.length}\n`);

  const result = await runPromptValidation();

  for (const source of PROMPT_SOURCES) {
    const sourceFailures = result.failures.filter(f => f.includes(source.name));
    if (sourceFailures.length === 0) {
      console.log(`✅ ${source.name}`);
    } else {
      console.log(`❌ ${source.name} — ${sourceFailures.length} violation(s):`);
      for (const f of sourceFailures) {
        console.log(`    - ${f}`);
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Prompt-level checks:   ${CONTRACT_CHECKS.length}`);
  console.log(`   Structural checks:     ${STRUCTURAL_CHECKS.length}`);
  console.log(`   Total assertions:      ${result.totalChecks}`);
  console.log(`   Passed:                ${result.passed}`);
  console.log(`   Failed:                ${result.failed}`);

  if (result.failed > 0) {
    console.log("\n❌ Validation FAILED — contract violations found.");
    process.exit(1);
  }

  console.log("\n✅ All prompt contracts verified.");
  process.exit(0);
}

// Only run CLI when executed directly (not imported as module)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith("validate-prompts.ts") ||
  process.argv[1].endsWith("validate-prompts")
);

if (isMainModule) {
  main();
}
