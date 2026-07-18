// Sprint 5: Prompt Management — barrel file
// Unified entry point: import from '@/modules/ai/prompts'
// Versioned prompts support A/B testing via prompt selector

// Writing (Paper 2 & 3)
export {
  version as writingVersion,
  description as writingDescription,
  buildWritingGrammarPrompt,
  buildWritingStylePrompt,
  getWritingOutlineSystemPrompt,
  buildWritingOutlineUserPrompt,
  buildIntegratedSkillsGenPrompt,
  buildIntegratedSkillsAnalysisPrompt,
  type IntegratedSkillsGenPromptParams,
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

// Reading (Paper 1)
export { version as readingVersion, buildReadingSectionPrompt } from './reading/v1';

// Speaking (Paper 4)
export { version as speakingVersion, buildSpeakingPrompt } from './speaking/v1';
