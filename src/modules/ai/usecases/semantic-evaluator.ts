// Sprint 127: Semantic / Task-Coverage Evaluator
// Provides structured evidence about task requirements and student coverage.
//
// CONTRACT:
//   This evaluator produces EVIDENCE only. It does NOT calculate scores,
//   penalties, or overallScore. The CLO Content evaluator consumes this
//   evidence to make more grounded judgments.
//
// Architecture:
//   Semantic evaluator → structured evidence → CLO Content evaluator
//   NOT: Semantic evaluator → penalty → overallScore

import { callLLM } from "../services/llm-call";
import { parseAIJSON } from "../services/json-utils";
import { sanitizeForAI } from "../services/sanitizer";
import { HALLUCINATION_GUARD } from "../services/hallucination-guard";
import { logger } from "@/shared/logger/logger";
import {
  SemanticEvaluationSchema,
  type SemanticEvaluation,
} from "../schemas/ai-schema";

// Re-export types for consumers
export type { SemanticEvaluation };
export type { TaskRequirementEvidence } from "../schemas/ai-schema";

// ============================================
// Prompt templates
// ============================================

const SEMANTIC_SYSTEM_PROMPT = `${HALLUCINATION_GUARD}

You are a task-coverage evaluator for HKDSE English Paper 2 writing.

Your job is NOT to score the student's writing.

Your job is to identify what the task requires and determine whether
the student's actual writing provides evidence for each requirement.

Return JSON only.

═══════════════════════════════════════
CORE PRINCIPLES
═══════════════════════════════════════

1. Extract task requirements conservatively from the actual task prompt.
2. Use the student's essay as the ONLY source of evidence.
3. Never invent evidence that does not appear in the student's text.
4. Never assume an idea exists merely because it would be reasonable.
5. Distinguish: satisfied, partial, missing, unclear.
   - "satisfied": requirement is clearly addressed with supporting text.
   - "partial": requirement is mentioned but development or coverage is incomplete.
   - "missing": no meaningful evidence in the essay for this requirement.
   - "unclear": text is too ambiguous to confidently determine.
6. "Partial" means the student addresses the requirement but development
   or coverage is incomplete — NOT that the writing is poor.
7. Do not assign numeric scores.
8. Do not assign penalties.
9. Do not classify an essay as incomplete merely because one requirement
   is missing.
10. Do not confuse task coverage with language quality.
11. Do not confuse task coverage with organization quality.
12. Do not require PEEL, concession/rebuttal, personal experience,
    complex sentences, or other teaching techniques unless the task
    explicitly requires them.
13. Keep evidence short and directly traceable to the student's text.
14. Each requirement should reference a specific task instruction,
    not a general writing quality.
15. Text-type conventions (letter format, speech structure) may be noted
    as requirements when the task specifies a text type.

═══════════════════════════════════════
OUTPUT FORMAT (strict JSON)
═══════════════════════════════════════

{
  "taskSummary": "Brief summary of what the task requires (1-2 sentences)",
  "requirements": [
    {
      "requirement": "Description of one task requirement",
      "status": "satisfied",
      "evidence": ["Direct quote or close paraphrase from student essay"],
      "explanation": "Why this status was assigned"
    }
  ],
  "overallCoverage": "high"
}

overallCoverage must be one of: "high", "medium", "low".
- "high": most or all requirements are satisfied.
- "medium": roughly half of requirements are addressed or most are partial.
- "low": few requirements are addressed or the essay is largely off-topic.

Evidence must be actual text from the student essay.
For "missing" or "unclear" requirements, evidence may be an empty array.`;

// ============================================
// Public function
// ============================================

export interface EvaluateTaskCoverageInput {
  prompt: string;
  studentDraft: string;
  textType?: string;
  title?: string;
  userId?: string;
}

export async function evaluateTaskCoverage(
  input: EvaluateTaskCoverageInput,
): Promise<SemanticEvaluation> {
  const sanitizedTitle = sanitizeForAI(input.title || "Writing Task");
  const sanitizedPrompt = sanitizeForAI(input.prompt);
  const sanitizedDraft = sanitizeForAI(input.studentDraft);
  const sanitizedTextType = input.textType
    ? sanitizeForAI(input.textType)
    : "Not specified";

  const userPrompt = `TASK TITLE:
${sanitizedTitle}

TASK INSTRUCTIONS:
${sanitizedPrompt}

TEXT TYPE:
${sanitizedTextType}

STUDENT ESSAY:
"""
${sanitizedDraft}
"""

Evaluate task coverage.

Remember:
- Evidence must come from the student essay.
- Do not invent missing evidence.
- Do not score the essay.
- Do not assign penalties.
- Do not rewrite the essay.
- Only extract requirements that are explicitly or clearly implied by the task.`;

  logger.info(
    {
      module: "semantic-evaluator",
      promptLen: sanitizedPrompt.length,
      draftLen: sanitizedDraft.length,
      textType: sanitizedTextType,
    },
    "Starting task coverage evaluation",
  );

  const raw = await callLLM(
    [
      { role: "system", content: SEMANTIC_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    {
      temperature: 0.2,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 20000,
      userId: input.userId,
    },
  );

  const parsed = parseAIJSON<SemanticEvaluation>(raw);
  const result = SemanticEvaluationSchema.parse(parsed);

  logger.info(
    {
      module: "semantic-evaluator",
      requirementCount: result.requirements.length,
      overallCoverage: result.overallCoverage,
    },
    "Task coverage evaluation completed",
  );

  return result;
}

// ============================================
// Semantic evidence → prompt context helper
// ============================================

/**
 * Convert a SemanticEvaluation result into a compact evidence context
 * string for injection into the CLO Content evaluator's user prompt.
 *
 * This is the ONLY way semantic evidence should influence scoring.
 * It does NOT produce a penalty or directly modify overallScore.
 */
export function buildSemanticEvidencePrompt(
  semantic: SemanticEvaluation,
): string {
  if (!semantic.requirements || semantic.requirements.length === 0) {
    return "";
  }

  return `
═══════════════════════════════════════
TASK-COVERAGE EVIDENCE
═══════════════════════════════════════

The following evidence was produced by a separate task-coverage evaluator.

Use it as supporting evidence when judging CONTENT.

IMPORTANT:
- This evidence does not determine the Content score automatically.
- Re-check the student's actual essay before relying on this evidence.
- Do not blindly trust the semantic evaluator.
- Language and Organization must remain independent of this evidence.
- Do not create an additional off-topic penalty from this evidence.

Overall task coverage estimate: ${semantic.overallCoverage}

${semantic.requirements
  .map(
    (item, index) =>
      `Requirement ${index + 1}: ${item.requirement}
Status: ${item.status}
Evidence:
${item.evidence.map((e) => `- ${e}`).join("\n") || "  (none)"}
Explanation: ${item.explanation}`,
  )
  .join("\n\n")}`;
}
