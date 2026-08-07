// ============================================
// Semantic Scorer — golden output comparison
//
// Compares generated output against a golden (previously
// approved) output using semantic similarity metrics.
// ============================================

import type { SemanticScore, ExpectedCharacteristics } from './types';

/**
 * Compute semantic similarity score between generated and golden output.
 * Returns 0-100 with per-dimension breakdown.
 */
export function computeSemanticScore(
  output: unknown,
  golden: unknown | undefined,
  _expected: ExpectedCharacteristics,
): SemanticScore {
  // No golden = no semantic comparison possible
  if (golden === undefined) {
    return {
      score: 100, // pass by default when no golden exists
      weight: 0.35,
      dimensions: {
        semanticSimilarity: 10,
        coverageSimilarity: 10,
        difficultySimilarity: 10,
        questionDiversity: 10,
        topicAlignment: 10,
        duplicatePenalty: 10,
      },
    };
  }

  const outputObj = output as Record<string, unknown> | null;
  const goldenObj = golden as Record<string, unknown> | null;

  const dimensions = {
    semanticSimilarity: compareSemanticSimilarity(outputObj, goldenObj),
    coverageSimilarity: compareCoverage(outputObj, goldenObj),
    difficultySimilarity: compareDifficulty(outputObj, goldenObj),
    questionDiversity: compareQuestionDiversity(outputObj, goldenObj),
    topicAlignment: compareTopicAlignment(outputObj, goldenObj),
    duplicatePenalty: scoreDuplicatePenalty(outputObj),
  };

  const dims = Object.values(dimensions);
  const score = Math.round(dims.reduce((a, b) => a + b, 0) / dims.length * 10);

  return {
    score: Math.min(100, Math.max(0, score)),
    weight: 0.35,
    dimensions,
  };
}

// ── Dimension comparators ──

function compareSemanticSimilarity(
  output: Record<string, unknown> | null,
  golden: Record<string, unknown> | null,
): number {
  if (!output || !golden) return 0;

  // Extract all string values for comparison
  const outputTexts = extractAllStrings(output);
  const goldenTexts = extractAllStrings(golden);

  if (outputTexts.length === 0 || goldenTexts.length === 0) return 5;

  // Compute token overlap ratio
  const outputTokens = new Set(tokenize(outputTexts.join(' ')));
  const goldenTokens = new Set(tokenize(goldenTexts.join(' ')));

  if (goldenTokens.size === 0) return 5;

  const intersection = [...outputTokens].filter(t => goldenTokens.has(t)).length;
  const ratio = intersection / goldenTokens.size;

  return Math.round(ratio * 10);
}

function compareCoverage(
  output: Record<string, unknown> | null,
  golden: Record<string, unknown> | null,
): number {
  if (!output || !golden) return 0;

  // Compare question counts
  const outQuestions = extractQuestions(output);
  const goldQuestions = extractQuestions(golden);

  if (!outQuestions || !goldQuestions) return 5;

  const ratio = Math.min(outQuestions.length, goldQuestions.length) /
                Math.max(outQuestions.length, goldQuestions.length, 1);
  return Math.round(ratio * 10);
}

function compareDifficulty(
  output: Record<string, unknown> | null,
  golden: Record<string, unknown> | null,
): number {
  if (!output || !golden) return 5;

  const outDiff = output.difficulty ?? output.level;
  const goldDiff = golden.difficulty ?? golden.level;

  if (typeof outDiff === 'string' && typeof goldDiff === 'string') {
    return outDiff === goldDiff ? 10 : 7;
  }
  return 8; // can't compare, give benefit of doubt
}

function compareQuestionDiversity(
  output: Record<string, unknown> | null,
  golden: Record<string, unknown> | null,
): number {
  if (!output || !golden) return 0;

  const outQuestions = extractQuestions(output);
  const goldQuestions = extractQuestions(golden);

  if (!outQuestions || !goldQuestions) return 5;

  // Count unique question types
  const outTypes = new Set(outQuestions.map(q => (q as Record<string, unknown>)?.type));
  const goldTypes = new Set(goldQuestions.map(q => (q as Record<string, unknown>)?.type));

  if (goldTypes.size === 0) return 5;

  const overlap = [...outTypes].filter(t => goldTypes.has(t)).length;
  const ratio = overlap / goldTypes.size;

  return Math.round(ratio * 10);
}

function compareTopicAlignment(
  output: Record<string, unknown> | null,
  golden: Record<string, unknown> | null,
): number {
  if (!output || !golden) return 5;

  const outTopic = output.topic ?? output.title;
  const goldTopic = golden.topic ?? golden.title;

  if (typeof outTopic === 'string' && typeof goldTopic === 'string') {
    const outTokens = new Set(tokenize(outTopic));
    const goldTokens = new Set(tokenize(goldTopic));
    const intersection = [...outTokens].filter(t => goldTokens.has(t)).length;
    if (intersection > 0) return 10;
    return 7;
  }
  return 8;
}

function scoreDuplicatePenalty(output: Record<string, unknown> | null): number {
  if (!output) return 0;

  const questions = extractQuestions(output);
  if (!questions || questions.length <= 1) return 10;

  // Check for exact duplicate questions
  const seen = new Set<string>();
  let duplicates = 0;
  for (const q of questions) {
    const key = JSON.stringify(q);
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }

  if (duplicates === 0) return 10;
  if (duplicates === 1) return 7;
  return Math.max(0, 10 - duplicates * 3);
}

// ── Helpers ──

function extractAllStrings(obj: Record<string, unknown>): string[] {
  const results: string[] = [];
  for (const value of Object.values(obj)) {
    if (typeof value === 'string') results.push(value);
    else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      results.push(...extractAllStrings(value as Record<string, unknown>));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') results.push(item);
        else if (typeof item === 'object' && item !== null) {
          results.push(...extractAllStrings(item as Record<string, unknown>));
        }
      }
    }
  }
  return results;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
}

function extractQuestions(obj: Record<string, unknown>): Record<string, unknown>[] | null {
  const q = obj['questions'] ?? (obj['paper'] as Record<string, unknown>)?.questions ?? (obj['data'] as Record<string, unknown>)?.questions ?? obj['exercises'];
  return Array.isArray(q) ? q as Record<string, unknown>[] : null;
}
