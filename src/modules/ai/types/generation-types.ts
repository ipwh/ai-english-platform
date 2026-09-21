// ============================================
// AI Generation Types — canonical shared types
// Sprint 93: Extracted from ai-service.ts to break type coupling
// Used by: ai-service, question-normalizer, usecases/generate-questions
// ============================================

export interface GenerateQuestionsInput {
  grammarItem?: string;
  grammarItemZh?: string;
  languageSkill?: string;
  languageSkillZh?: string;
  difficulty: 'remedial' | 'core' | 'challenge';
  gradeLevel: string;
  count?: number;
  questionType?: 'mc' | 'fill-blank' | 'error-correction' | 'short-writing' | 'matching';
  topic?: string;
  userId?: string;
}

export interface GeneratedQuestion {
  type: string;
  prompt: string;
  promptZh?: string;
  choices?: string[];
  answer: string;
  explanationZh: string;
  explanationEn: string;
  commonMistake: string;
  grammarPoint?: string;
  listeningContent?: string;
  listeningContentZh?: string;
  readingContent?: string;
  readingContentZh?: string;
  /** Explicit option-count contract for question families such as T/F/NG. */
  verificationExpectedChoiceCount?: number;
  /**
   * 2026-09-21：文字答案的比對嚴格度（預設 'exact'）。
   * - `'exact'`：正規化後必須相等（適用於確定性答案鍵：填允、summary cloze、
   *   sentence transformation、排序題）。
   * - `'overlap'`：允許「與覆核器自答有足夠內容詞重疊」視為通過。適用於
   *   **由 AI 語意評分**（答案鍵只是參考答案，非唯一字串）的短答題，
   *   例如 reference / inference / vocabulary_in_context / short_answer。
   *   目的：只用於阻擋「完全錯誤的答案鍵」，**不得**用來放寬確定性題型。
   */
  verificationAnswerMatch?: 'exact' | 'overlap';
  /** R3.10-D: server-assigned canonical GrammarQuestion id (grammar only). */
  id?: string;
}
