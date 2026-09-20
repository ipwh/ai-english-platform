// Sprint 5: Prompt Management — barrel file
// Unified entry point: import from '@/modules/ai/prompts'
// Versioned prompts support A/B testing via prompt selector

// Writing (Paper 2 & 3)
export {
  version as writingVersion,
  description as writingDescription,
  getWritingOutlineSystemPrompt,
  buildWritingOutlineUserPrompt,
} from './writing/v1';

// Grammar & Language
export {
  version as grammarVersion,
  STRICT_ANSWER_RULES,
  GEMINI_JSON_INSTRUCTION,
  buildQuestionGenerationPrompt,
  getExplainMistakeSystemPrompt,
  buildExplainMistakeUserPrompt,
  getProgressAnalysisSystemPrompt,
  buildProgressAnalysisUserPrompt,
  type QuestionGenPromptParams,
} from './grammar/v1';

// Answer analysis (separate module)
export { buildAnswerAnalysisPrompt } from './grammar/answer-analysis';

// Answer verification (pre-delivery answer-key audit)
export {
  ANSWER_VERIFICATION_SYSTEM_PROMPT,
  ANSWER_VERIFICATION_VERSION,
  buildAnswerVerificationUserPrompt,
  type AnswerVerificationPromptItem,
} from './grammar/answer-verification';

// Reading (Paper 1) — v2 with full DSE support
export {
  version as readingVersion,
  buildFullDSEPaperPrompt,
  buildReadingExercisePrompt,
} from './reading/v1';
export type { FullPaperPromptParams } from './reading/v1';

// Reading — DSE templates & descriptors (for direct import)
export { DSE_QUESTION_TEMPLATES, DSE_PART_QUESTION_MIX, DSE_RUBRIC_PHRASES } from './reading/dse-question-templates';
export { HKEAA_READING_LEVEL_DESCRIPTORS, HKEAA_TO_PLATFORM_DIFFICULTY, B1_B2_LEVEL_CAPS, buildHKEAALevelPrompt } from './reading/dse-level-descriptors';
export { DSE_TEXT_TYPES, DSE_PUBLICATION_SOURCES, HK_LOCAL_TOPIC_RATIO, buildTextTypePrompt, buildHKLocalPrompt } from './reading/text-types';
export type { DSEtextType } from './reading/text-types';

// Speaking (Paper 4)
export { version as speakingVersion, buildSpeakingPrompt } from './speaking/v1';
