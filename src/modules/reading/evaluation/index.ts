// ============================================
// Phase 2A: Reading Evaluation — Barrel Export
// ============================================

export type {
  CopyingLevel,
  ParaphraseQuality,
  GrammarFit,
  Completeness,
  EvidenceSpan,
  ReadingAnswerEvaluation,
} from './reading-answer-types';
export { createEmptyEvaluation } from './reading-answer-types';

export {
  API_EVALUATED_DSE_TYPES,
  OBJECTIVE_DSE_TYPES,
  requiresApiEvaluation,
  normalizeForComparison,
  estimateCopyingRatio,
  classifyCopyingLevel,
  detectLexicalShift,
  detectStructuralShift,
  classifyParaphraseQuality,
  detectGrammarFit,
  assessCompleteness,
  evaluateToneAttitude,
  buildEvaluation,
  shouldApplyCopyPenalty,
  detectExpectedPos,
  isVagueToneAnswer,
  applyQualityDowngrade,
} from './reading-answer-evaluator';
