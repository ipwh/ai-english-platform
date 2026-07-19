// Sprint 27: AI Writing Coach — barrel exports
// Sprint 39: Writing Coach Pro — extended exports
export type {
  EssaySubmission, EssayReview, RubricScores, HKDSEScores, CEFRScores,
  GrammarIssue, VocabularySuggestion, CoherenceAnalysis,
  TaskFulfillment, OrganizationAnalysis, StyleAnalysis,
  RevisionPlan, PriorityAction, RevisionComparison,
  RevisionHistory, EssayVersion,
  // Pro types
  IELTSScores, ProRubricScores,
  SentenceVarietyAnalysis, ToneRegisterAnalysis, LogicArgumentAnalysis,
  ExpressionUpgrade, ParagraphRewrite, SentenceRewrite,
  ProRevisionPlan, ProRevisionComparison, RevisionRecord,
} from './types';

export {
  scoreRubric, reviewEssay, compareRevisions,
  saveRevision, getRevisionHistory, getLatestVersion,
  getGrammarRules, getVocabUpgrades,
} from './services/writing-coach';

export { WritingCoachPro, writingCoachPro } from './services/writing-coach-pro';
