// ============================================
// Sprint 105: Semantic Comparator
// Heuristic-based semantic comparison without LLM.
// Uses token overlap, keyword similarity, normalized phrase comparison.
// ============================================

import { areSynonyms } from './accepted-answer';

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

  // Weighted combination
  return (
    exactScore * 0.35 +
    synonymScore * 0.25 +
    bigramScore * 0.15 +
    charSim * 0.25
  );
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
