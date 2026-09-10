// ============================================
// Daily Challenge Rotation — canonical topic/type selection
// ============================================
// Pure, deterministic daily rotation logic (single owner for the daily
// challenge schedule). Owns the 30-day topic cycle and the question-type
// rotation. The MC-only constraint for open-ended topics is owned by the
// AI module (`open-ended-topics.ts`) and re-exported here.
// ============================================

import { OPEN_ENDED_GRAMMAR_TOPICS } from '@/shared/utils/open-ended-topics';

export const DAILY_QUESTION_TYPES = ['mc', 'fill-blank'] as const;
export type DailyQuestionType = (typeof DAILY_QUESTION_TYPES)[number];

// 每日文法主題輪換（30 天循環）
export const DAILY_TOPICS = [
  'tenses', 'conditionals', 'passive-voice', 'relative-clauses', 'modals',
  'articles', 'prepositions', 'connectives', 'gerunds-infinitives', 'phrasal-verbs',
  'reported-speech', 'subject-verb-agreement', 'comparatives-superlatives', 'question-forms',
  'negation', 'adjectives-adverbs', 'pronouns', 'quantifiers', 'inversion',
  'participles', 'noun-clauses', 'participle-phrases', 'tenses', 'conditionals',
  'passive-voice', 'modals', 'prepositions', 'articles', 'connectives', 'phrasal-verbs',
] as const;

// 開放式答案空間的主題（canonical set，見 ai/services/open-ended-topics.ts）
export const MC_ONLY_TOPICS: ReadonlySet<string> = OPEN_ENDED_GRAMMAR_TOPICS;

/** 依年內日序（1-based day of year）決定當日文法主題。 */
export function resolveDailyTopic(dayOfYear: number): string {
  const idx = ((dayOfYear % DAILY_TOPICS.length) + DAILY_TOPICS.length) % DAILY_TOPICS.length;
  return DAILY_TOPICS[idx];
}

/**
 * 依主題與年內日序決定題型。
 * 開放式主題（question-forms 等）一律回傳 'mc'，確保伺服器能以單一
 * 答案鍵公平批改；其餘主題依 mc/fill-blank 隔日輪換。
 */
export function resolveDailyQuestionType(grammarItem: string, dayOfYear: number): DailyQuestionType {
  const raw = DAILY_QUESTION_TYPES[dayOfYear % DAILY_QUESTION_TYPES.length];
  return MC_ONLY_TOPICS.has(grammarItem) ? 'mc' : raw;
}
