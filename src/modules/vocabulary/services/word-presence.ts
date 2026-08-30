// ============================================
// Word Presence Validation — vocabulary suggestion anti-hallucination guard
// ============================================
// 2026-08-30 audit: /api/vocabulary/suggest previously trusted the AI's
// suggestions without verifying the suggested word actually appears in the
// text the student submitted. This module provides the deterministic check
// (exact token match + light inflection tolerance).
// ============================================

/**
 * Check whether `word` (or a light inflection of it) actually appears in
 * `text` as a standalone token. Prevents the AI from recommending words the
 * submitted text never contains.
 */
export function wordAppearsInText(word: string, text: string): boolean {
  const w = word.toLowerCase().trim().replace(/[^a-z'-]/g, '');
  if (w.length < 2) return false;

  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9'-]+/)
    .map(t => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return false;

  // Light inflection tolerance: text may contain a derived form of the
  // suggested base word (e.g., suggests "recycle", text has "recycling").
  const variants = new Set<string>([
    w,
    `${w}s`,
    `${w}es`,
    `${w}ed`,
    `${w}d`,
    `${w}ing`,
  ]);
  if (w.endsWith('e')) variants.add(`${w.slice(0, -1)}ing`);
  if (w.endsWith('y')) variants.add(`${w.slice(0, -1)}ies`);
  // e.g., "stop" → "stopped" (consonant doubling) is covered by exact-match
  // only; the strict check rejects anything beyond the listed variants.

  return tokens.some(t => variants.has(t));
}
