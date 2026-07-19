// Sprint 27: AI Writing Coach — barrel exports
export type {
  EssaySubmission, EssayReview, RubricScores, HKDSEScores, CEFRScores,
  GrammarIssue, VocabularySuggestion, CoherenceAnalysis,
  TaskFulfillment, OrganizationAnalysis, StyleAnalysis,
  RevisionPlan, PriorityAction, RevisionComparison,
  RevisionHistory, EssayVersion,
} from './types';

export {
  scoreRubric, reviewEssay, compareRevisions,
  saveRevision, getRevisionHistory, getLatestVersion,
  getGrammarRules, getVocabUpgrades,
} from './services/writing-coach';
