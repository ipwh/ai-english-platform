// ============================================
// Open-ended grammar topics — AI-layer re-export
// ============================================
// The canonical policy lives in `src/shared/utils/open-ended-topics.ts`
// (single owner, shared by the AI generation layer and the exercise layer).
// Re-exported here so AI modules can import it without reaching into shared
// directly at every call site.
// ============================================

export {
  OPEN_ENDED_GRAMMAR_TOPICS,
  isOpenEndedGrammarTopic,
  resolveEffectiveQuestionType,
} from '@/shared/utils/open-ended-topics';
