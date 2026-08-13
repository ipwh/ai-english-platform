// ============================================
// R3.10-D.1: Practice Submission Classification
// ============================================
// The SINGLE classification contract for POST /api/practice.
// Every production caller must map to exactly one class:
//
//   reading              → server ReadingQuestion authority
//   grammar              → server GrammarQuestion authority
//   legacy-language-skill→ client-key scoring (persistable for history;
//                          NEVER trusted by evidence or mastery)
//   unknown              → rejected (400) — never silently routed to the
//                          grammar authority path
//
// Do NOT expand LEGACY_LANGUAGE_SKILLS for grammar keys, and do NOT
// treat unknown skill values as grammar.
// ============================================

import { GRAMMAR_ITEM_LABELS } from '@/shared/types/types';
import type { GrammarItem } from '@/shared/types/types';
import { GRAMMAR_GRAPH } from '@/modules/learning/services/knowledge-graph';

export type PracticeSubmissionClass =
  | 'reading'
  | 'grammar'
  | 'legacy-language-skill'
  | 'unknown';

/** Production language-skill values (exact spelling, including hyphenated forms). */
export const LEGACY_LANGUAGE_SKILLS: ReadonlySet<string> = new Set([
  'reading',
  'listening',
  'writing',
  'speaking',
  'integrated',
  'integrated-skills',
  'vocabulary',
]);

/** Canonical grammar keys: Appendix-4 GrammarItem union + knowledge-graph grammar nodes + compat buckets. */
export const CANONICAL_GRAMMAR_KEYS: ReadonlySet<string> = new Set<string>([
  ...(Object.keys(GRAMMAR_ITEM_LABELS) as GrammarItem[]),
  ...GRAMMAR_GRAPH.filter(n => n.category === 'grammar').map(n => n.id),
  'grammar',
  'general',
]);

/** Reading submission = dse-reading source OR any answer carrying dseType. */
export function hasReadingMarker(input: { source?: string | null; answers?: unknown }): boolean {
  if (input.source === 'dse-reading') return true;
  if (!Array.isArray(input.answers)) return false;
  return input.answers.some(a => {
    if (!a || typeof a !== 'object') return false;
    const t = (a as { dseType?: unknown }).dseType;
    return typeof t === 'string' && t.length > 0;
  });
}

export function classifyPracticeSubmission(input: {
  source?: string | null;
  skill?: string | null;
  answers?: unknown;
}): PracticeSubmissionClass {
  if (hasReadingMarker(input)) return 'reading';
  const skill = String(input.skill ?? '').trim().toLowerCase();
  if (!skill) return 'unknown';
  if (LEGACY_LANGUAGE_SKILLS.has(skill)) return 'legacy-language-skill';
  if (CANONICAL_GRAMMAR_KEYS.has(skill)) return 'grammar';
  return 'unknown';
}

/**
 * INVARIANT-D9: only server-authoritative paths (server-key grammar /
 * server reading) may update trusted mastery. Legacy client-key paths
 * may persist rows for history/display but must never feed mastery.
 */
export function isServerAuthoritativeSubmission(cls: PracticeSubmissionClass): boolean {
  return cls === 'grammar' || cls === 'reading';
}

/** Mastery update eligibility: authoritative path AND non-zero server-derived totals. */
export function shouldUpdateMastery(cls: PracticeSubmissionClass, totalQuestions: number): boolean {
  return isServerAuthoritativeSubmission(cls) && totalQuestions > 0;
}
