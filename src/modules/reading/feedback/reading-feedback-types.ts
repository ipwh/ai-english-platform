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

  /**
   * 2026-09-17 (fix A): quality issues found in an answer that is
   * nonetheless CORRECT. Quality signals must never change `verdict` — when
   * the scorer says the answer is right, the same signal is reported here
   * instead of in `errorType`.
   */
  qualityFlags?: ReadingErrorType[];

  /** EN note explaining the quality flags raised on a correct answer */
  qualityAdvice?: string;

  /** 繁體中文：正確答案的品質提示 */
  qualityAdviceZh?: string;

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

/**
 * 2026-09-17 (fix E): display labels for the diagnostic verdict badge.
 * The UI used to print the raw enum (`partially correct`) inside an
 * otherwise Chinese interface.
 */
export const VERDICT_LABELS: Record<ReadingDiagnosticFeedback['verdict'], { zh: string; en: string }> = {
  correct: { zh: '正確', en: 'Correct' },
  partially_correct: { zh: '部分正確', en: 'Partially correct' },
  incorrect: { zh: '不正確', en: 'Incorrect' },
};

/**
 * 2026-09-17 (fix E): display labels for error types and quality flags, so
 * the UI never leaks English snake_case codes into Chinese mode.
 */
export const ERROR_TYPE_LABELS: Record<ReadingErrorType, { zh: string; en: string }> = {
  missed_keyword: { zh: '未對應題目關鍵詞', en: 'missed keyword' },
  missed_contrast: { zh: '忽略對比關係', en: 'missed contrast' },
  missed_negation: { zh: '忽略否定詞', en: 'missed negation' },
  wrong_reference: { zh: '前詞判斷錯誤', en: 'wrong reference' },
  paraphrase_too_close: { zh: '改寫不足（太接近原文）', en: 'paraphrase too close' },
  paraphrase_too_far: { zh: '改寫偏離原意', en: 'paraphrase too far' },
  tone_too_vague: { zh: '語調描述太籠統', en: 'tone too vague' },
  pos_mismatch: { zh: '詞性不符', en: 'part of speech mismatch' },
  grammar_mismatch: { zh: '詞形文法不符', en: 'grammar mismatch' },
  incomplete_answer: { zh: '答案不完整', en: 'incomplete answer' },
  distractor_trap: { zh: '落入干擾項陷阱', en: 'distractor trap' },
  unsupported_inference: { zh: '推論缺乏文本支持', en: 'unsupported inference' },
};
