// ============================================
// Phase 2B: Reading Diagnostic Feedback Types
// Structured feedback model for DSE Paper 1.
// ============================================

/** DSE reading error taxonomy */
export type ReadingErrorType =
  | 'missed_keyword'
  | 'missed_contrast'
  | 'missed_negation'
  | 'wrong_reference'
  | 'paraphrase_too_close'
  | 'paraphrase_too_far'
  | 'tone_too_vague'
  | 'pos_mismatch'
  | 'grammar_mismatch'
  | 'incomplete_answer'
  | 'distractor_trap'
  | 'unsupported_inference';

/** Structured diagnostic feedback for a single DSE reading answer */
export interface ReadingDiagnosticFeedback {
  /** Overall verdict */
  verdict: 'correct' | 'partially_correct' | 'incorrect';

  /** The reading skill being tested (e.g. "Referencing", "Vocabulary in context") */
  skillTarget: string;

  /** 繁體中文：所測試的閱讀技能 */
  skillTargetZh?: string;

  /** Where to find the answer in the passage */
  locatingClue?: string;

  /** 繁體中文：答案在篇章中的位置提示 */
  locatingClueZh?: string;

  /** Summary of the evidence that supports the expected answer */
  evidenceSummary?: string;

  /** 繁體中文：支持正答的證據摘要 */
  evidenceSummaryZh?: string;

  /** Classified error type if the answer is wrong/weak */
  errorType?: ReadingErrorType;

  /** Concrete advice on how to improve */
  improvementAdvice?: string;

  /** 繁體中文：具體改善建議 */
  improvementAdviceZh?: string;

  /** Specific paraphrase guidance */
  paraphraseAdvice?: string;

  /** 繁體中文：改寫指引 */
  paraphraseAdviceZh?: string;

  /** Specific grammar/form guidance */
  grammarAdvice?: string;

  /** 繁體中文：文法/詞形指引 */
  grammarAdviceZh?: string;

  /** For MC items: explanations of why distractors are wrong */
  distractorNotes?: string[];

  /** 繁體中文：干擾項分析 */
  distractorNotesZh?: string[];

  /** Confidence in this diagnosis */
  confidence?: 'low' | 'medium' | 'high';
}

/** DSE skill labels by type */
export const DSE_SKILL_LABELS: Record<string, string> = {
  multiple_choice: 'Comprehension — Multiple choice',
  true_false_not_given: 'Comprehension — True/False/Not Given',
  reference: 'Referencing — Pronoun/antecedent resolution',
  vocabulary_in_context: 'Vocabulary in context — Word meaning from clues',
  inference: 'Inference — Reading between the lines',
  tone_attitude: 'Tone/attitude — Writer\'s stance and purpose',
  summary_cloze: 'Summary cloze — Completing a summary accurately',
  sentence_transformation: 'Sentence transformation — Paraphrase and grammar fit',
  short_answer: 'Short answer — Locating and paraphrasing evidence',
};

/** DSE skill labels (繁體中文) by type */
export const DSE_SKILL_LABELS_ZH: Record<string, string> = {
  multiple_choice: '閱讀理解 — 選擇題',
  true_false_not_given: '閱讀理解 — 對／錯／文中無提及',
  reference: '代詞指涉 — 代名詞／前詞解析',
  vocabulary_in_context: '語境詞義 — 從上下文推斷詞義',
  inference: '推論 — 讀出言外之意',
  tone_attitude: '語調／態度 — 作者的立場與目的',
  summary_cloze: '摘要填充 — 準確完成摘要',
  sentence_transformation: '句子轉換 — 改寫與文法配合',
  short_answer: '短答 — 定位與改寫證據',
};
