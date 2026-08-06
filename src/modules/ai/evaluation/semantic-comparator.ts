// ============================================
// Sprint 111: Semantic Comparator with Embedding Fallback
// When keyword matching gives a low score, use embedding similarity
// to detect good paraphrasing. Rewards students who rephrase correctly.
// ============================================

import { areSynonyms } from './accepted-answer';
import { logger } from '@/shared/logger/logger';

/** Token-based similarity score between two normalized strings. */
export function computeSemanticScore(
  studentAnswer: string,
  referenceAnswer: string,
): number {
  if (!studentAnswer || !referenceAnswer) return 0;
  if (studentAnswer === referenceAnswer) return 1;

  const sTokens = studentAnswer.split(/\s+/).filter(w => w.length > 0);
  const rTokens = referenceAnswer.split(/\s+/).filter(w => w.length > 0);

  if (rTokens.length === 0) return sTokens.length === 0 ? 1 : 0;
  if (sTokens.length === 0) return 0;

  // Exact token overlap
  const rSet = new Set(rTokens);
  let exactMatches = 0;
  for (const t of sTokens) {
    if (rSet.has(t)) exactMatches++;
  }
  const exactScore = exactMatches / rTokens.length;

  // Synonym overlap
  let synonymMatches = 0;
  for (const st of sTokens) {
    for (const rt of rTokens) {
      if (areSynonyms(st, rt)) {
        synonymMatches++;
        break;
      }
    }
  }
  const synonymScore = synonymMatches / rTokens.length;

  // Phrase-level comparison (bigrams)
  const sBigrams = new Set<string>();
  for (let i = 0; i < sTokens.length - 1; i++) {
    sBigrams.add(`${sTokens[i]} ${sTokens[i + 1]}`);
  }
  const rBigrams = new Set<string>();
  for (let i = 0; i < rTokens.length - 1; i++) {
    rBigrams.add(`${rTokens[i]} ${rTokens[i + 1]}`);
  }
  let bigramOverlap = 0;
  for (const bg of rBigrams) {
    if (sBigrams.has(bg)) bigramOverlap++;
  }
  const bigramScore = rBigrams.size > 0 ? bigramOverlap / rBigrams.size : 0;

  // Character-level similarity (normalized Levenshtein)
  const charSim = computeCharSimilarity(studentAnswer, referenceAnswer);

  // Weighted combination (keyword-based)
  const keywordScore =
    exactScore * 0.35 +
    synonymScore * 0.25 +
    bigramScore * 0.15 +
    charSim * 0.25;

  return Math.round(keywordScore * 100) / 100;
}

/**
 * Semantic score WITH embedding fallback.
 * When the keyword-based score is low (< 0.5), this function
 * attempts embedding-based similarity to detect good paraphrasing.
 *
 * Educational benefit: Students who use different wording to express
 * the same meaning should NOT lose marks. This rewards paraphrasing,
 * which is a key DSE Paper 1 skill.
 *
 * Returns: { score, usedEmbedding, embeddingScore }
 */
export async function computeSemanticScoreWithEmbedding(
  studentAnswer: string,
  referenceAnswer: string,
): Promise<{ score: number; usedEmbedding: boolean; embeddingScore?: number }> {
  // First, compute the keyword-based score
  const keywordScore = computeSemanticScore(studentAnswer, referenceAnswer);

  // If keyword score is good enough, return it directly (fast path)
  if (keywordScore >= 0.65) {
    return { score: keywordScore, usedEmbedding: false };
  }

  // If keyword score is very low, try embedding similarity
  if (keywordScore < 0.5) {
    try {
      const embeddingScore = await computeEmbeddingSimilarity(studentAnswer, referenceAnswer);

      // If embedding score is high, the student likely paraphrased well
      if (embeddingScore > 0.80) {
        // Boost the score significantly — good paraphrase detected
        const boostedScore = Math.max(keywordScore, embeddingScore * 0.9);
        logger.info({
          module: 'semantic-comparator',
          keywordScore,
          embeddingScore,
          boostedScore: Math.round(boostedScore * 100) / 100,
        }, 'Embedding fallback: detected good paraphrase');
        return {
          score: Math.round(boostedScore * 100) / 100,
          usedEmbedding: true,
          embeddingScore,
        };
      }

      if (embeddingScore > 0.65) {
        // Moderate embedding match — partial boost
        const blendedScore = keywordScore * 0.4 + embeddingScore * 0.6;
        return {
          score: Math.round(blendedScore * 100) / 100,
          usedEmbedding: true,
          embeddingScore,
        };
      }
    } catch (err) {
      // Embedding service unavailable — fall back to keyword score silently
      logger.warn({
        module: 'semantic-comparator',
        error: String(err),
      }, 'Embedding fallback failed, using keyword score');
    }
  }

  return { score: keywordScore, usedEmbedding: false };
}

/** Compute cosine similarity between two texts using Vertex AI embeddings. */
async function computeEmbeddingSimilarity(textA: string, textB: string): Promise<number> {
  // Lazy import to avoid loading embeddings module when not needed
  const { getEmbedding, cosineSimilarity } = await import(
    '@/modules/ai/services/vertex-embeddings'
  );

  const [embA, embB] = await Promise.all([
    getEmbedding(textA),
    getEmbedding(textB),
  ]);

  return cosineSimilarity(embA, embB);
}

/** Compute keyword coverage score. */
export function computeKeywordScore(
  studentAnswer: string,
  keywords: string[],
): { score: number; matched: string[]; missing: string[] } {
  if (!keywords || keywords.length === 0) {
    return { score: 1, matched: [], missing: [] };
  }

  const normalized = studentAnswer.toLowerCase();
  const matched: string[] = [];
  const missing: string[] = [];

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase().trim();
    if (normalized.includes(kwLower)) {
      matched.push(kw);
    } else {
      // Check for synonym match
      const synonyms = kwLower.split(/\s+/);
      let found = false;
      for (const syn of synonyms) {
        if (normalized.includes(syn)) { matched.push(kw); found = true; break; }
        // Check synonym dictionary
        for (const token of normalized.split(/\s+/)) {
          if (areSynonyms(token, syn)) { matched.push(kw); found = true; break; }
        }
        if (found) break;
      }
      if (!found) missing.push(kw);
    }
  }

  const score = keywords.length > 0 ? matched.length / keywords.length : 1;
  return { score: Math.round(score * 100) / 100, matched, missing };
}

/** Compute simple character-level similarity using normalized Levenshtein distance. */
function computeCharSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(a, b);
  return 1 - (dist / maxLen);
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,    // deletion
        dp[i][j - 1] + 1,    // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
    }
  }
  return dp[m][n];
}
