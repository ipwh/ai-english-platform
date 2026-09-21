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
  /** R3.10-D: server-assigned canonical GrammarQuestion id (grammar only). */
  id?: string;
}
