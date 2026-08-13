// ============================================
// Model Essay Generation — prompts + pedagogical quality gate
// ============================================
// Generation quality control. This is NOT a scoring engine:
//   - The gate judges "does the essay fit the pedagogical target?"
//     It NEVER produces a score or a DSE level.
//   - The canonical scorer (writing-score-policy.ts + analyze-writing.ts)
//     is NEVER consulted by the gate.
//   - Generation target metadata is server-determined (see
//     writing-artifact.ts); the LLM can only produce the essay text.
//
// Failure semantics: after max attempts without targetFit, the caller
// receives ModelGenerationUnavailableError — never an unverified essay
// silently labelled as a Level-targeted model.
// ============================================

import { HALLUCINATION_GUARD } from "../services/hallucination-guard";
import { parseAIJSON } from "../services/json-utils";
import type { GenerationTarget, WritingArtifactMetadata } from "./writing-artifact";
import { buildGeneratedModelMetadata } from "./writing-artifact";

export const MODEL_ESSAY_MAX_ATTEMPTS = 3; // 1 initial + 2 retries

export class ModelGenerationUnavailableError extends Error {
  readonly status = "MODEL_GENERATION_UNAVAILABLE" as const;
  readonly retryable = true;

  constructor(reason: string) {
    super(reason);
    this.name = "ModelGenerationUnavailableError";
  }
}

/** Target label used ONLY inside prompts (never persisted as authority). */
function targetDescription(target: GenerationTarget): string {
  switch (target) {
    case "low":
      return "Level 2 (low-range)";
    case "mid":
      return "Level 3 (mid-range)";
    case "high":
      return "Level 5 (high)";
  }
}

export function buildModelEssaySystemPrompt(input: {
  target: GenerationTarget;
  textType: string;
  words: number;
}): string {
  const { target, textType, words } = input;
  const midRules =
    target === "mid"
      ? [
          "- Level 3 (mid): correct but less sophisticated English — basic to intermediate vocabulary, mostly simple and compound sentences with limited advanced embedding, adequate (not maximal) content development, clear basic organization, reasonable but not exceptionally nuanced support, student-like style (not polished model-answer rhetoric)",
          "- DO NOT deliberately insert grammar mistakes or wrong answers — a Level 3 model is CORRECT but LESS SOPHISTICATED; minor natural imperfections may occur but must never be manufactured",
        ].join("\n")
      : target === "low"
        ? [
            "- Level 2 (low): short simple sentences, very basic vocabulary, thin but relevant content, simple paragraphing — CORRECT text, never deliberately incorrect",
          ].join("\n")
        : [
            "- Level 5 (high): sophisticated vocabulary, varied sentence structures, excellent organization, highly developed ideas, flawless grammar",
          ].join("\n");

  return `${HALLUCINATION_GUARD}
You are an HKDSE English teacher. Write a model essay at ${targetDescription(target)} standard.

The essay must:
- Respond to the given writing prompt COMPLETELY
- Be approximately ${words} words
- Match the required text type (${textType || "essay"})
${midRules}
- Sound like a real Hong Kong secondary school student's work (not an academic paper)

Return ONLY a JSON object:
{ "essay": "the complete model essay text" }`;
}

export function buildModelEssayUserPrompt(input: {
  topic: string;
  gradeLevel: string;
  target: GenerationTarget;
  words: number;
}): string {
  return `Writing prompt:\n"""\n${input.topic}\n"""\n\nGrade level: ${input.gradeLevel || "S4"}\nTarget level: ${targetDescription(input.target)}\nWord limit: ~${input.words} words`;
}

// ============================================
// Pedagogical Quality Gate — boolean fit only, NEVER a score
// ============================================

/** Gate verdict: booleans only. A numeric score / level would create a second scoring authority and is forbidden. */
export interface ModelEssayQualityVerdict {
  targetFit: boolean;
  contentFit: boolean;
  languageFit: boolean;
  organizationFit: boolean;
  sophisticationFit: boolean;
  issues: string[];
}

export function buildQualityGateSystemPrompt(input: {
  target: GenerationTarget;
}): string {
  return `${HALLUCINATION_GUARD}
You are a generation-quality reviewer for HKDSE model essays.

Judge whether the essay FITS its pedagogical target (${targetDescription(input.target)}).
This is GENERATION QUALITY CONTROL — you do NOT score the essay and you do
NOT assign any DSE level. Assess only:

- contentFit: content adequacy matches the target band (not over-developed)
- languageFit: grammar/vocabulary sophistication matches the target band
- organizationFit: structural complexity matches the target band
- sophisticationFit: rhetorical/argument sophistication matches the target band

Return ONLY JSON with BOOLEAN fields:
{
  "targetFit": true,
  "contentFit": true,
  "languageFit": true,
  "organizationFit": true,
  "sophisticationFit": true,
  "issues": ["short issue description, empty if none"]
}
Do NOT return any numeric score or level.`;
}

export function buildQualityGateUserPrompt(input: {
  target: GenerationTarget;
  essay: string;
}): string {
  return `Target: ${targetDescription(input.target)}\n\nModel essay:\n"""\n${input.essay}\n"""\n\nJudge fit. Booleans only.`;
}

/** Parse + validate the judge output. Extra fields (e.g. a rogue "score") are ignored. */
export function parseQualityVerdict(raw: string): ModelEssayQualityVerdict | undefined {
  const parsed = parseAIJSON<Partial<ModelEssayQualityVerdict> & Record<string, unknown>>(raw);
  const bool = (v: unknown): boolean => v === true;
  if (
    typeof parsed.targetFit !== "boolean" ||
    !Array.isArray(parsed.issues)
  ) {
    return undefined;
  }
  return {
    targetFit: parsed.targetFit === true,
    contentFit: bool(parsed.contentFit),
    languageFit: bool(parsed.languageFit),
    organizationFit: bool(parsed.organizationFit),
    sophisticationFit: bool(parsed.sophisticationFit),
    issues: parsed.issues.filter((i): i is string => typeof i === "string"),
  };
}

// ============================================
// Orchestration (injectable LLM functions for testability)
// ============================================

export interface ModelEssayGenerationDeps {
  /** Generate the essay text (returns raw LLM JSON/text). */
  generate: (systemPrompt: string, userPrompt: string) => Promise<string>;
  /** Judge the essay against the target (returns raw LLM JSON). */
  judge: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

export interface GeneratedModelEssayResult {
  essay: string;
  metadata: WritingArtifactMetadata;
  qualityVerdict: ModelEssayQualityVerdict;
}

export async function generateModelEssayWithQualityGate(
  input: {
    topic: string;
    textType?: string;
    gradeLevel?: string;
    wordLimit?: number;
    target: GenerationTarget;
  },
  deps: ModelEssayGenerationDeps,
): Promise<GeneratedModelEssayResult> {
  const words = input.wordLimit || 250;
  const target = input.target;
  const systemPrompt = buildModelEssaySystemPrompt({
    target,
    textType: input.textType || "essay",
    words,
  });
  const userPrompt = buildModelEssayUserPrompt({
    topic: input.topic,
    gradeLevel: input.gradeLevel || "S4",
    target,
    words,
  });

  let lastVerdict: ModelEssayQualityVerdict | undefined;

  for (let attempt = 1; attempt <= MODEL_ESSAY_MAX_ATTEMPTS; attempt++) {
    const rawEssay = await deps.generate(systemPrompt, userPrompt);
    let essay: string;
    try {
      const parsed = parseAIJSON<{ essay?: unknown }>(rawEssay);
      // Parse success but missing/empty essay field → invalid generation attempt.
      essay = typeof parsed.essay === "string" ? parsed.essay.trim() : "";
    } catch {
      // Bare prose fallback (no JSON wrapper).
      essay = rawEssay.trim();
    }
    if (!essay) {
      lastVerdict = {
        targetFit: false, contentFit: false, languageFit: false,
        organizationFit: false, sophisticationFit: false,
        issues: ["generated essay was empty"],
      };
      continue;
    }

    let verdict: ModelEssayQualityVerdict | undefined;
    try {
      verdict = parseQualityVerdict(
        await deps.judge(
          buildQualityGateSystemPrompt({ target }),
          buildQualityGateUserPrompt({ target, essay }),
        ),
      );
    } catch {
      verdict = undefined;
    }

    if (verdict?.targetFit === true) {
      return {
        essay,
        metadata: buildGeneratedModelMetadata({ generationTarget: target, qualityStatus: "verified" }),
        qualityVerdict: verdict,
      };
    }

    lastVerdict = verdict ?? {
      targetFit: false, contentFit: false, languageFit: false,
      organizationFit: false, sophisticationFit: false,
      issues: ["quality gate did not return a valid verdict"],
    };
  }

  throw new ModelGenerationUnavailableError(
    `範文生成未通過品質閘（attempts: ${MODEL_ESSAY_MAX_ATTEMPTS}）` +
    (lastVerdict && lastVerdict.issues.length > 0
      ? ` — ${lastVerdict.issues.slice(0, 3).join("; ")}`
      : ""),
  );
}
