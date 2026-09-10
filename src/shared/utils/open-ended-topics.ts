// ============================================
// Open-ended grammar topics — canonical shared policy (single owner)
// ============================================
// Grammar topics whose fill-blank answers have an OPEN answer space:
// multiple grammatically-correct answers exist for the same blank
// (e.g. "what measures should governments take" vs "what should we do"),
// so a single server-held answer key cannot grade them fairly.
//
// Policy: fill-blank generation is FORBIDDEN for these topics — they are
// deterministically coerced to MCQ. Shared here so both the AI generation
// layer and the exercise/daily-challenge layer enforce the same rule
// without cross-module coupling.
// ============================================

export const OPEN_ENDED_GRAMMAR_TOPICS: ReadonlySet<string> = new Set([
  'question-forms',    // 疑問句形式：開放式補完問句
  'modals',            // 情態動詞：must/should/can/may 等多選
  'articles',          // 冠詞：a/an/the 可能多選
  'prepositions',      // 介詞：in/on/at 可能多選
  'connectives',       // 連接詞：because/since/as/so 等多選
  'phrasal-verbs',     // 片語動詞：多個同義片語
  'relative-clauses',  // 關係子句：who/that/which 常可互換
  'negation',          // 否定：開放式轉換
  'inversion',         // 倒裝：開放式轉換
  'pronouns',          // 代名詞：可能多選
  'quantifiers',       // 數量詞：many/some/a few 等多選
]);

export function isOpenEndedGrammarTopic(topic: string | null | undefined): boolean {
  return !!topic && OPEN_ENDED_GRAMMAR_TOPICS.has(topic);
}

/**
 * Resolve the effective question type for generation.
 * - writing skill → short-writing
 * - matching → mc (non-deliverable: delivery layer cannot render matching)
 * - fill-blank on an open-ended grammar topic → mc (single answer key)
 * - otherwise unchanged
 */
export function resolveEffectiveQuestionType(
  questionType: string | undefined,
  grammarItem: string | undefined,
  languageSkill: string | undefined,
): string {
  if (languageSkill === 'writing') return 'short-writing';
  const t = questionType || 'mc';
  // matching 題型不可交付（交付層無法渲染配對 UI）→ 強制改用 mc。
  if (t === 'matching') return 'mc';
  if (t === 'fill-blank' && isOpenEndedGrammarTopic(grammarItem)) return 'mc';
  return t;
}
