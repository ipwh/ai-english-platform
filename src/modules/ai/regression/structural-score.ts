// ============================================
// Structural Validator — binary pass/fail checks
//
// Validates JSON schema, question count, difficulty,
// paragraph distribution, and reference integrity.
// All failures are automatic FAIL in regression.
// ============================================

import type { ExpectedCharacteristics, StructuralScore } from './types';

/**
 * Compute structural score from a generated output against expected characteristics.
 * Returns a score 0-100 and detailed check results.
 */
export function computeStructuralScore(
  output: unknown,
  expected: ExpectedCharacteristics,
): StructuralScore {
  const checks = {
    jsonSchema: checkJsonSchema(output),
    questionCount: checkQuestionCount(output, expected.questionCount),
    difficulty: checkDifficulty(output, expected.difficulty),
    paragraphDistribution: checkParagraphDistribution(output, expected.paragraphCount),
    blueprintCompliance: checkBlueprint(output),
    referenceIntegrity: checkReferenceIntegrity(output),
    noEmptyFields: checkNoEmptyFields(output),
    validQuestionTypes: checkQuestionTypes(output),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const rawScore = total > 0 ? (passed / total) * 100 : 0;
  const score = Number.isFinite(rawScore) ? Math.round(rawScore) : 0;

  return { score, weight: 0.25, checks };
}

// ── Individual checks ──

function checkJsonSchema(output: unknown): boolean {
  if (output === null || output === undefined) return false;
  if (typeof output !== 'object') return false;
  // Must be a non-null object with at least some keys
  return Object.keys(output as object).length > 0;
}

function checkQuestionCount(output: unknown, expected?: number): boolean {
  if (expected === undefined) return true;
  const obj = output as Record<string, unknown> | null;
  if (!obj) return false;
  const questions = obj['questions'] ?? (obj['paper'] as Record<string, unknown>)?.questions ?? (obj['data'] as Record<string, unknown>)?.questions;
  if (!Array.isArray(questions)) return false;
  return questions.length >= expected * 0.8 && questions.length <= expected * 1.2;
}

function checkDifficulty(output: unknown, expected?: string): boolean {
  if (!expected) return true;
  const obj = output as Record<string, unknown> | null;
  if (!obj) return false;
  // Check top-level or nested difficulty field
  const diff = obj.difficulty ?? obj.level ?? obj.targetLevel;
  return typeof diff === 'string' && diff.length > 0;
}

function checkParagraphDistribution(output: unknown, expected?: number): boolean {
  if (expected === undefined) return true;
  const obj = output as Record<string, unknown> | null;
  if (!obj) return false;
  // Check readingContent or passage has paragraphs
  const content = obj.readingContent ?? obj.passage ?? obj.passages;
  if (typeof content === 'string') {
    const paras = content.split(/\[Paragraph\s+\d+\]/gi).filter(Boolean);
    return paras.length >= expected;
  }
  if (Array.isArray(content)) {
    return content.length >= expected;
  }
  return true; // can't verify, don't fail
}

function checkBlueprint(output: unknown): boolean {
  const obj = output as Record<string, unknown> | null;
  if (!obj) return false;
  const questions = obj['questions'] ?? (obj['paper'] as Record<string, unknown>)?.questions;
  if (!Array.isArray(questions)) return true; // no questions = not applicable
  // Verify each question has required fields
  return questions.every((q: unknown) => {
    if (typeof q !== 'object' || q === null) return false;
    const qo = q as Record<string, unknown>;
    return typeof qo.type === 'string' || typeof qo.questionType === 'string';
  });
}

function checkReferenceIntegrity(output: unknown): boolean {
  const obj = output as Record<string, unknown> | null;
  if (!obj) return false;
  const questions = obj['questions'] ?? (obj['paper'] as Record<string, unknown>)?.questions;
  if (!Array.isArray(questions)) return true;
  // Verify paragraph references, if present, are numbers
  return questions.every((q: unknown) => {
    if (typeof q !== 'object' || q === null) return true;
    const qo = q as Record<string, unknown>;
    const ref = qo.paragraphRef ?? qo.paragraph;
    if (ref === undefined || ref === null) return true; // not required
    return typeof ref === 'number' || (typeof ref === 'string' && /^\d+$/.test(ref));
  });
}

function checkNoEmptyFields(output: unknown): boolean {
  if (output === null || output === undefined) return false;
  if (typeof output !== 'object') return true;
  // Recursively check no field is null or empty string where it shouldn't be
  return !hasEmptyRequiredFields(output as Record<string, unknown>, 0);
}

function hasEmptyRequiredFields(obj: Record<string, unknown>, depth: number): boolean {
  if (depth > 3) return false; // limit recursion
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '' && !key.startsWith('_')) return true;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (hasEmptyRequiredFields(value as Record<string, unknown>, depth + 1)) return true;
    }
  }
  return false;
}

function checkQuestionTypes(output: unknown): boolean {
  const obj = output as Record<string, unknown> | null;
  if (!obj) return false;
  const questions = obj['questions'] ?? (obj['paper'] as Record<string, unknown>)?.questions;
  if (!Array.isArray(questions)) return true;
  const validTypes = new Set([
    'mcq', 'mc', 'multiple_choice', 'trueFalseNG', 'true_false_not_given',
    'matching', 'shortAnswer', 'short_answer', 'referencing', 'reference',
    'synonymSearch', 'synonym_search', 'phraseSearch', 'vocabularyInContext',
    'vocabulary', 'inference', 'toneAttitude', 'tone_attitude', 'sequencing',
    'exampleFinding', 'authorIntention', 'summaryCloze', 'summary_cloze',
    'mcCloze', 'mc_cloze', 'errorCorrectionSummary', 'tableCompletion',
    'causeEffectCompletion', 'negativeInference',
  ]);
  return questions.every((q: unknown) => {
    if (typeof q !== 'object' || q === null) return false;
    const qo = q as Record<string, unknown>;
    const type = qo.type ?? qo.questionType;
    return typeof type === 'string' && validTypes.has(type);
  });
}
