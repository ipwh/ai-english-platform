// ============================================
// Rubric Scorer — quality dimension scoring
//
// Evaluates generated output across 8 quality dimensions.
// Outputs a score 0-100 with per-dimension breakdown.
// ============================================

import type { RubricScore, ExpectedCharacteristics } from './types';

/**
 * Clamp a score to 0-100, guarding against NaN and Infinity.
 * NaN and Infinity are replaced with 0 to prevent corrupt scores
 * from propagating into reports and release decisions.
 */
function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Compute rubric score from generated output against expected characteristics.
 */
export function computeRubricScore(
  output: unknown,
  expected: ExpectedCharacteristics,
): RubricScore {
  const obj = output as Record<string, unknown> | null;

  const dimensions = {
    accuracy: scoreAccuracy(obj, expected),
    coverage: scoreCoverage(obj, expected),
    difficultyMatch: scoreDifficultyMatch(obj, expected),
    instructionFollowing: scoreInstructionFollowing(obj, expected),
    hallucination: scoreHallucination(obj),
    consistency: scoreConsistency(obj),
    jsonValidity: scoreJsonValidity(obj),
    schemaCompliance: scoreSchemaCompliance(obj),
  };

  // Weight each dimension equally within the rubric category
  const dims = Object.values(dimensions);

  return {
    score: clampScore(dims.reduce((a, b) => a + b, 0) / dims.length * 10),
    weight: 0.40,
    dimensions,
  };
}

// ── Dimension scorers ──

function scoreAccuracy(obj: Record<string, unknown> | null, _expected: ExpectedCharacteristics): number {
  if (!obj) return 0;
  // Check that core output structure is present and non-empty
  const hasContent = obj.readingContent || obj.passage || obj.questions || obj.exercises;
  if (!hasContent) return 3;
  // Check for obvious hallucinations (e.g., "[Paragraph" without content)
  const str = JSON.stringify(obj);
  const hallmarks = str.includes('undefined') || str.includes('[object Object]');
  return hallmarks ? 5 : 9;
}

function scoreCoverage(obj: Record<string, unknown> | null, expected: ExpectedCharacteristics): number {
  if (!obj) return 0;
  let score = 5;

  // Check question count
  const questions = extractQuestions(obj);
  if (expected.questionCount && Array.isArray(questions)) {
    const ratio = questions.length / expected.questionCount;
    if (ratio >= 0.9 && ratio <= 1.1) score += 3;
    else if (ratio >= 0.7) score += 1;
  }

  // Check paragraph coverage if expected
  if (expected.paragraphCount) {
    const content = obj.readingContent || obj.passage;
    if (typeof content === 'string') {
      const paras = content.split(/\[Paragraph\s+\d+\]/gi).filter(Boolean);
      if (paras.length >= expected.paragraphCount) score += 2;
    }
  }

  return Math.min(10, score);
}

function scoreDifficultyMatch(obj: Record<string, unknown> | null, expected: ExpectedCharacteristics): number {
  if (!obj || !expected.difficulty) return 7; // can't verify, give benefit of doubt
  const actualDiff = obj.difficulty ?? obj.level ?? obj.targetLevel;
  if (typeof actualDiff === 'string' && actualDiff.toLowerCase().includes(expected.difficulty.toLowerCase())) {
    return 10;
  }
  return 6;
}

function scoreInstructionFollowing(obj: Record<string, unknown> | null, _expected: ExpectedCharacteristics): number {
  if (!obj) return 0;
  let score = 7;
  // Check response is well-formed JSON object (not a string containing JSON, not an array)
  if (typeof obj === 'object' && !Array.isArray(obj)) score += 2;
  // Check no error fields
  if (!obj.error && !obj.errors) score += 1;
  return Math.min(10, score);
}

function scoreHallucination(obj: Record<string, unknown> | null): number {
  if (!obj) return 0;
  const str = JSON.stringify(obj).toLowerCase();
  let score = 10;
  // Penalize common hallucination patterns
  if (str.includes('as an ai')) score -= 3;
  if (str.includes('i cannot')) score -= 2;
  if (str.includes('i apologize')) score -= 2;
  if (str.includes('however, i')) score -= 1;
  // Penalize placeholder content
  if (str.includes('lorem ipsum')) score -= 5;
  if (str.includes('[insert')) score -= 3;
  return Math.max(0, score);
}

function scoreConsistency(obj: Record<string, unknown> | null): number {
  if (!obj) return 0;
  let score = 8;
  const str = JSON.stringify(obj);

  // Check question count consistency
  const questions = extractQuestions(obj);
  if (Array.isArray(questions)) {
    const countField = obj.questionCount ?? obj.totalQuestions;
    if (typeof countField === 'number' && countField !== questions.length) score -= 2;
    // Check for duplicate questions
    const texts = questions.map(q => JSON.stringify(q));
    if (new Set(texts).size < texts.length) score -= 3;
  }

  return Math.max(0, Math.min(10, score));
}

function scoreJsonValidity(obj: Record<string, unknown> | null): number {
  if (obj === null || obj === undefined) return 0;
  if (typeof obj !== 'object') return 2;
  if (Array.isArray(obj)) return 4;
  try {
    JSON.parse(JSON.stringify(obj));
    return 10;
  } catch {
    return 5;
  }
}

function scoreSchemaCompliance(obj: Record<string, unknown> | null): number {
  if (!obj) return 0;
  let score = 5;
  // Check for common expected top-level fields based on content
  if (obj['questions'] || (obj['paper'] as Record<string, unknown>)?.questions || obj['exercises']) score += 2;
  if (obj.readingContent || obj.passage || obj.content) score += 2;
  if (obj.type || obj.questionType) score += 1;
  return Math.min(10, score);
}

// ── Helpers ──

function extractQuestions(obj: Record<string, unknown>): unknown[] | null {
  const q = obj['questions'] ?? (obj['paper'] as Record<string, unknown>)?.questions ?? (obj['data'] as Record<string, unknown>)?.questions ?? obj['exercises']; 
  return Array.isArray(q) ? q : null;
}
