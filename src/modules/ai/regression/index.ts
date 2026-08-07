// ============================================
// Prompt Regression Evaluation — Barrel Export
// ============================================

export type {
  EvalFixture, ExpectedCharacteristics,
  EvalResult, EvalScores, EvalFailure,
  RubricScore, SemanticScore, StructuralScore,
  RegressionReport, RegressionConfig,
} from './types';

export {
  DEFAULT_REGRESSION_CONFIG,
  SCORE_WEIGHTS,
} from './types';

export { computeRubricScore } from './rubric-score';
export { computeSemanticScore } from './semantic-score';
export { computeStructuralScore } from './structural-score';
export { runRegression } from './runner';
export type { RunOptions, EvalProviderCall } from './runner';
export { generateMarkdownReport } from './report';
